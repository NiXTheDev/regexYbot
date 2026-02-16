import { Logger } from "./logger";
import type { TaskMessage, ResultMessage } from "./types";
import { HealthMonitor, type HealthMetrics } from "./healthMonitor";
import { WorkerError } from "./errors";

const logger = new Logger("WorkerPool");

/**
 * Worker state tracking for idle management
 */
interface WorkerState {
	worker: Worker;
	isIdle: boolean;
	lastActiveTime: number;
}

/**
 * Configuration options for WorkerPool
 */
export interface WorkerPoolConfig {
	/** Maximum number of workers allowed */
	maxWorkers: number;
	/** Minimum number of workers to keep (even when idle) */
	minWorkers: number;
	/** Initial number of workers to spawn */
	initialWorkers: number;
	/** Timeout for individual tasks in milliseconds */
	taskTimeoutMs: number;
	/** Idle timeout before scaling down in milliseconds */
	idleTimeoutMs: number;
	/** Interval to check for idle workers in milliseconds */
	idleCheckIntervalMs: number;
	/** Path to worker script */
	workerScript: string;
}

/**
 * WorkerPool - Dynamic worker pool with lazy initialization and auto-scaling
 *
 * Features:
 * - Starts with minimal workers (lazy initialization)
 * - Central FIFO task queue
 * - Workers pull tasks from queue
 * - Scales up when queue grows
 * - Scales down idle workers after timeout (smart logic)
 */
export class WorkerPool {
	private config: WorkerPoolConfig;
	private workers: Map<Worker, WorkerState> = new Map();
	/** Central FIFO task queue */
	private taskQueue: Array<{
		task: TaskMessage;
		resolve: (value: ResultMessage) => void;
		reject: (reason?: unknown) => void;
	}> = [];
	private pendingTasks = new Map<
		Worker,
		{
			resolve: (value: ResultMessage) => void;
			reject: (reason?: unknown) => void;
			timeout: NodeJS.Timeout;
			startTime: number;
		}
	>();
	private timeouts = new Map<Worker, NodeJS.Timeout>();
	private idleCheckInterval: NodeJS.Timeout | null = null;
	private isShuttingDown = false;
	private healthMonitor: HealthMonitor;

	constructor(config: WorkerPoolConfig) {
		this.config = config;
		logger.info(
			`Initializing WorkerPool (min: ${config.minWorkers}, max: ${config.maxWorkers}, initial: ${config.initialWorkers})`,
		);

		// Initialize health monitor
		this.healthMonitor = new HealthMonitor({
			enabled: true,
			intervalMs: 60000,
			workerThreshold: config.minWorkers,
			queueThreshold: 100,
			errorRateThreshold: 0.1,
		});

		// Spawn initial workers
		for (let i = 0; i < config.initialWorkers; i++) {
			this.spawnWorker();
		}

		// Start idle check interval
		this.idleCheckInterval = setInterval(
			() => this.checkIdleWorkers(),
			config.idleCheckIntervalMs,
		);
		// Unref so it doesn't keep the process alive
		this.idleCheckInterval.unref();

		logger.info(`WorkerPool initialized with ${this.workers.size} workers`);
	}

	/**
	 * Spawn workers and add to pool
	 * @param count - Number of workers to spawn (default: 1)
	 * @returns Number of workers actually spawned
	 */
	private spawnWorker(count = 1): number {
		// During shutdown, allow spawning beyond maxWorkers to drain queue
		const bypassMaxWorkers = this.isShuttingDown;
		let spawned = 0;

		for (let i = 0; i < count; i++) {
			// Check if we can spawn more workers
			if (!bypassMaxWorkers && this.workers.size >= this.config.maxWorkers) {
				if (spawned === 0) {
					logger.debug("Max workers reached, cannot spawn more");
				}
				break;
			}

			try {
				const worker = new Worker(this.config.workerScript);
				const state: WorkerState = {
					worker,
					isIdle: true,
					lastActiveTime: Date.now(),
				};

				worker.onmessage = (event) =>
					this.handleWorkerMessage(worker, event.data);
				worker.onerror = (error) => this.handleWorkerError(worker, error);

				this.workers.set(worker, state);
				spawned++;
			} catch (error) {
				logger.error(`Failed to spawn worker: ${error}`);
				break;
			}
		}

		if (spawned > 0) {
			logger.debug(
				`Spawned ${spawned} worker(s) ${this.workers.size}/${bypassMaxWorkers ? "unlimited" : this.config.maxWorkers}`,
			);
			// Immediately try to give tasks to workers if queue has work
			this.processQueue();
		}

		return spawned;
	}

	/**
	 * Find an idle worker to assign a task
	 */
	private getIdleWorker(): Worker | null {
		for (const [worker, state] of this.workers.entries()) {
			if (state.isIdle) {
				return worker;
			}
		}
		return null;
	}

	/**
	 * Process the next task in queue if workers are available
	 */
	private processQueue(): void {
		if (this.isShuttingDown || this.taskQueue.length === 0) {
			return;
		}

		// Try to find an idle worker
		let idleWorker = this.getIdleWorker();

		// If no idle worker, try to spawn a new one
		if (!idleWorker && this.workers.size < this.config.maxWorkers) {
			// Spawn 1 worker - it will be available after spawnWorker returns
			this.spawnWorker(1);
			// Try to get the newly spawned worker
			idleWorker = this.getIdleWorker();
		}

		// Assign task to idle worker
		if (idleWorker && this.taskQueue.length > 0) {
			const { task, resolve, reject } = this.taskQueue.shift()!;
			this.assignTaskToWorker(idleWorker, task, resolve, reject);

			// Try to process more tasks if available
			this.processQueue();
		}
	}

	/**
	 * Process queue during shutdown - can spawn beyond maxWorkers limit
	 */
	private processQueueDuringShutdown(): void {
		if (this.taskQueue.length === 0) {
			return;
		}

		// Try to find an idle worker
		let idleWorker = this.getIdleWorker();

		// During shutdown, spawn workers without maxWorkers limit (up to queue size)
		if (!idleWorker) {
			// Spawn 1 worker during shutdown - bypasses maxWorkers
			this.spawnWorker(1);
			// Try to get the newly spawned worker
			idleWorker = this.getIdleWorker();
		}

		// Assign task to idle worker
		if (idleWorker && this.taskQueue.length > 0) {
			const { task, resolve, reject } = this.taskQueue.shift()!;
			this.assignTaskToWorker(idleWorker, task, resolve, reject);

			// Try to process more tasks if available
			this.processQueueDuringShutdown();
		}
	}

	/**
	 * Assign a task to a specific worker
	 */
	private assignTaskToWorker(
		worker: Worker,
		task: TaskMessage,
		resolve: (value: ResultMessage) => void,
		reject: (reason?: unknown) => void,
	): void {
		const state = this.workers.get(worker);
		if (!state) return;

		// Set up timeout
		const timeout = setTimeout(() => {
			this.handleWorkerTimeout(worker);
		}, this.config.taskTimeoutMs);

		// Track pending task
		this.pendingTasks.set(worker, {
			resolve,
			reject,
			timeout,
			startTime: Date.now(),
		});

		// Update worker state
		state.isIdle = false;
		state.lastActiveTime = Date.now();

		// Send task to worker
		worker.postMessage(task);
		logger.debug(
			`Assigned task to worker (${this.taskQueue.length} tasks remaining in queue)`,
		);
	}

	/**
	 * Handle successful worker message
	 */
	private handleWorkerMessage(worker: Worker, result: ResultMessage): void {
		const pending = this.pendingTasks.get(worker);
		const state = this.workers.get(worker);

		if (pending) {
			clearTimeout(pending.timeout);
			this.pendingTasks.delete(worker);

			// Calculate task duration and record in health monitor
			const duration = Date.now() - pending.startTime;
			if (result.error) {
				this.healthMonitor.recordError();
				pending.reject(new WorkerError(result.error, "worker_execution"));
			} else {
				this.healthMonitor.recordSuccess(duration);
				pending.resolve(result);
			}

			if (state) {
				state.isIdle = true;
				state.lastActiveTime = Date.now();
			}
		} else {
			logger.warn("Received message from worker with no pending task");
		}

		// Process next task if available
		this.processQueue();
	}

	/**
	 * Handle worker error
	 */
	private handleWorkerError(worker: Worker, error: ErrorEvent): void {
		const errorMessage =
			error.message || String(error.error) || "Unknown worker error";
		logger.error(`Worker error: ${errorMessage}`);

		const pending = this.pendingTasks.get(worker);
		if (pending) {
			clearTimeout(pending.timeout);
			this.pendingTasks.delete(worker);
			pending.reject(new WorkerError(errorMessage, "worker_error"));
		}

		// Record error in health monitor
		this.healthMonitor.recordError();

		// Remove failed worker and replace if needed
		this.workers.delete(worker);
		worker.terminate();

		// Spawn replacement if we're below minimum
		if (this.workers.size < this.config.minWorkers && !this.isShuttingDown) {
			this.spawnWorker();
		}

		// Process queue to reassign any waiting tasks
		this.processQueue();
	}

	/**
	 * Handle worker task timeout
	 */
	private handleWorkerTimeout(worker: Worker): void {
		logger.warn(`Worker task timed out after ${this.config.taskTimeoutMs}ms`);

		const pending = this.pendingTasks.get(worker);
		if (pending) {
			this.pendingTasks.delete(worker);
			pending.reject(
				new Error(
					`Regex operation timed out after ${this.config.taskTimeoutMs / 1000}s. Please use a simpler pattern.`,
				),
			);
		}

		// Record timeout as error in health monitor
		this.healthMonitor.recordError();

		// Terminate and replace the worker
		const state = this.workers.get(worker);
		if (state) {
			this.workers.delete(worker);
			worker.terminate();

			if (!this.isShuttingDown) {
				this.spawnWorker();
			}
		}

		// Process queue
		this.processQueue();
	}

	/**
	 * Check for idle workers and scale down if needed
	 *
	 * Smart logic:
	 * - Count idle workers
	 * - If queue has tasks: only terminate excess idle workers (idleWorkers > queueLength)
	 * - If queue is empty: can terminate all idle workers above minimum
	 * - Never terminate if it would leave tasks waiting
	 */
	private checkIdleWorkers(): void {
		if (this.isShuttingDown) return;

		const now = Date.now();
		const idleWorkers: Worker[] = [];
		const queueLength = this.taskQueue.length;

		// Find all idle workers that have been idle for longer than timeout
		for (const [worker, state] of this.workers.entries()) {
			if (
				state.isIdle &&
				!this.pendingTasks.has(worker) &&
				now - state.lastActiveTime > this.config.idleTimeoutMs
			) {
				idleWorkers.push(worker);
			}
		}

		if (idleWorkers.length === 0) return;

		// Calculate how many workers we can safely terminate
		let workersToTerminate = 0;

		if (queueLength > 0) {
			// There are tasks in the queue
			// Keep enough idle workers to handle the queue
			// Only terminate excess idle workers
			const excessIdleWorkers = idleWorkers.length - queueLength;
			if (excessIdleWorkers > 0) {
				workersToTerminate = excessIdleWorkers;
			}
		} else {
			// Queue is empty, we can terminate all idle workers above minimum
			const workersAboveMinimum = this.workers.size - this.config.minWorkers;
			workersToTerminate = Math.min(idleWorkers.length, workersAboveMinimum);
		}

		// Ensure we don't go below minimum workers
		const maxTerminations = this.workers.size - this.config.minWorkers;
		workersToTerminate = Math.min(workersToTerminate, maxTerminations);

		// Terminate workers
		if (workersToTerminate > 0) {
			logger.debug(
				`Queue is empty, ${idleWorkers.length} idle workers. ` +
					`Terminating ${workersToTerminate} workers (keeping min: ${this.config.minWorkers}).`,
			);
			for (let i = 0; i < workersToTerminate && i < idleWorkers.length; i++) {
				const worker = idleWorkers[i];
				const state = this.workers.get(worker);

				if (state) {
					const idleDuration = now - state.lastActiveTime;
					logger.info(
						`Scaling down idle worker (idle for ${Math.round(idleDuration / 1000)}s)`,
					);
					this.workers.delete(worker);
					worker.terminate();
				}
			}
		}
	}

	/**
	 * Submit a task to the worker pool
	 * This is the main public API
	 */
	public run(taskData: TaskMessage): Promise<ResultMessage> {
		if (this.isShuttingDown) {
			return Promise.reject(
				new WorkerError("Worker pool is shutting down", "shutdown"),
			);
		}

		logger.debug(`Queueing new task (queue size: ${this.taskQueue.length})`);

		return new Promise((resolve, reject) => {
			this.taskQueue.push({ task: taskData, resolve, reject });
			this.processQueue();
		});
	}

	/**
	 * Get current pool statistics
	 */
	public getStats(): {
		totalWorkers: number;
		idleWorkers: number;
		busyWorkers: number;
		queuedTasks: number;
		pendingTasks: number;
		isShuttingDown: boolean;
		health: HealthMetrics;
	} {
		let idleWorkers = 0;
		let busyWorkers = 0;

		for (const state of this.workers.values()) {
			if (state.isIdle && !this.pendingTasks.has(state.worker)) {
				idleWorkers++;
			} else {
				busyWorkers++;
			}
		}

		const health = this.healthMonitor.calculateHealth(
			this.workers.size,
			idleWorkers,
			this.taskQueue.length,
			this.pendingTasks.size,
		);

		return {
			totalWorkers: this.workers.size,
			idleWorkers,
			busyWorkers,
			queuedTasks: this.taskQueue.length,
			pendingTasks: this.pendingTasks.size,
			isShuttingDown: this.isShuttingDown,
			health,
		};
	}

	/**
	 * Get detailed information about each worker
	 */
	public getWorkerDetails(): Array<{
		workerId: number;
		isIdle: boolean;
		isProcessing: boolean;
		lastActiveTime: number;
		idleDurationMs: number;
	}> {
		const now = Date.now();
		const details: Array<{
			workerId: number;
			isIdle: boolean;
			isProcessing: boolean;
			lastActiveTime: number;
			idleDurationMs: number;
		}> = [];

		let workerId = 0;
		for (const [worker, state] of this.workers.entries()) {
			const isProcessing = this.pendingTasks.has(worker);
			details.push({
				workerId: ++workerId,
				isIdle: state.isIdle && !isProcessing,
				isProcessing,
				lastActiveTime: state.lastActiveTime,
				idleDurationMs: now - state.lastActiveTime,
			});
		}

		return details;
	}

	/**
	 * Get the current load factor (0.0 to 1.0)
	 * Based on ratio of queued tasks to available worker capacity
	 */
	public getLoadFactor(): number {
		if (this.workers.size === 0) return 0;

		const idleWorkers = this.getStats().idleWorkers;
		const totalWorkers = this.workers.size;

		// Load factor = (busy workers + queued tasks) / total workers
		// Capped at 1.0
		const busyWorkers = totalWorkers - idleWorkers;
		const load = (busyWorkers + this.taskQueue.length) / totalWorkers;

		return Math.min(load, 1.0);
	}

	/**
	 * Graceful shutdown with optional task draining
	 *
	 * @param options - Shutdown options
	 * @param options.drainTasks - If true, attempt to complete queued tasks before shutting down
	 * @param options.drainTimeoutMs - Maximum time to wait for task draining
	 */
	public async shutdown(options?: {
		drainTasks?: boolean;
		drainTimeoutMs?: number;
	}): Promise<void> {
		if (this.isShuttingDown) return;
		this.isShuttingDown = true;

		const drainTasks = options?.drainTasks ?? false;
		const drainTimeoutMs = options?.drainTimeoutMs ?? 10000;

		logger.info(
			`Shutting down WorkerPool${drainTasks ? " (with task draining)" : ""}...`,
		);

		// Stop idle check
		if (this.idleCheckInterval) {
			clearInterval(this.idleCheckInterval);
			this.idleCheckInterval = null;
		}

		// Stop health monitor
		this.healthMonitor.stop();

		if (drainTasks) {
			// Attempt to drain tasks - spawn workers up to queue size to process quickly
			const tasksToDrain = this.taskQueue.length;
			logger.info(`Draining ${tasksToDrain} queued tasks...`);

			// Spawn additional workers to handle all queued tasks (bypassing maxWorkers limit)
			const workersNeeded = Math.min(tasksToDrain, 20); // Cap at 20 to prevent runaway spawning
			const currentWorkers = this.workers.size;
			const workersToSpawn = Math.max(0, workersNeeded - currentWorkers);

			if (workersToSpawn > 0) {
				logger.info(
					`Scaling up to ${workersNeeded} workers during shutdown (normally max ${this.config.maxWorkers})`,
				);
				// Spawn all workers at once - more efficient than loop
				this.spawnWorker(workersToSpawn);
			}

			const startTime = Date.now();

			// Keep processing until queue is empty or timeout
			while (this.taskQueue.length > 0 || this.pendingTasks.size > 0) {
				if (Date.now() - startTime > drainTimeoutMs) {
					logger.warn(`Drain timeout reached after ${drainTimeoutMs}ms`);
					break;
				}

				// Process remaining tasks - allow spawning beyond maxWorkers
				this.processQueueDuringShutdown();

				// Wait a bit before checking again
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Reject any remaining queued tasks
		const remainingTasks = this.taskQueue.length;
		if (remainingTasks > 0) {
			logger.warn(`Rejecting ${remainingTasks} unprocessed tasks`);
		}

		while (this.taskQueue.length > 0) {
			const { reject } = this.taskQueue.shift()!;
			reject(new WorkerError("Worker pool is shutting down", "shutdown"));
		}

		// Clear all timeouts
		for (const timeout of this.timeouts.values()) {
			clearTimeout(timeout);
		}
		this.timeouts.clear();

		// Reject pending tasks
		for (const { reject, timeout } of this.pendingTasks.values()) {
			clearTimeout(timeout);
			reject(new WorkerError("Worker pool is shutting down", "shutdown"));
		}
		this.pendingTasks.clear();

		// Terminate all workers
		logger.info(`Terminating ${this.workers.size} workers...`);
		for (const [worker] of this.workers.entries()) {
			worker.terminate();
		}
		this.workers.clear();

		logger.info("WorkerPool shut down complete");
	}
}
