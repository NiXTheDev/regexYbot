import { Logger } from "./logger";
import type { ResultMessage, TaskMessage } from "./types";
import { CONFIG } from "./config";
import type { IWorkerPool } from "./workerPoolInterface";
import { WorkerError } from "./errors";

const logger = new Logger("WorkerPool");
const { WORKER_TIMEOUT_MS } = CONFIG;

export class WorkerPool implements IWorkerPool {
	private workers: Worker[];
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
		}
	>();
	private timeouts = new Map<Worker, NodeJS.Timeout>();
	private workerScript: string;

	constructor(poolSize: number, workerScript: string) {
		this.workerScript = workerScript;
		logger.info(`Initializing worker pool with size ${poolSize}...`);
		this.workers = Array.from({ length: poolSize }, (_, i) => {
			logger.debug(
				`Creating worker ${i + 1}/${poolSize} from script: ${workerScript}`,
			);
			return this.createWorker(i + 1, poolSize);
		});
		logger.info("Worker pool initialized.");
	}

	private createWorker(_index: number, _total: number): Worker {
		const worker = new Worker(this.workerScript);
		worker.onmessage = (event) => this.handleWorkerMessage(worker, event.data);
		worker.onerror = (error) => this.handleWorkerError(worker, error);
		return worker;
	}

	private replaceWorker(deadWorker: Worker): void {
		const index = this.workers.indexOf(deadWorker);
		if (index !== -1) {
			logger.info(`Replacing worker ${index + 1}/${this.workers.length}...`);
			const newWorker = this.createWorker(index + 1, this.workers.length);
			this.workers[index] = newWorker;
		}
	}

	private handleWorkerMessage(worker: Worker, result: ResultMessage) {
		logger.debug("Received result from a worker.");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			logger.debug("Resolving promise for the completed task.");
			pending.resolve(result);
			this.pendingTasks.delete(worker);
		} else {
			logger.error(
				"Received a message from a worker that wasn't handling a task.",
			);
		}
		this.processQueue();
	}

	private handleWorkerError(worker: Worker, error: ErrorEvent) {
		const errorMessage =
			error.message ||
			error.error?.message ||
			String(error.error) ||
			"Unknown worker error";
		logger.error(`WORKER ERROR: ${errorMessage}`);
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			pending.reject(
				new WorkerError(
					errorMessage,
					"worker_error",
					this.workers.indexOf(worker),
				),
			);
			this.pendingTasks.delete(worker);
		}
		this.replaceWorker(worker);
		this.processQueue();
	}

	private handleWorkerTimeout(worker: Worker): void {
		logger.warn("Worker task timed out, terminating worker.");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			const workerIndex = this.workers.indexOf(worker);
			pending.reject(
				new WorkerError(
					`Regex operation timed out after ${WORKER_TIMEOUT_MS}ms`,
					"worker_timeout",
					workerIndex,
					{ timeout: WORKER_TIMEOUT_MS },
				),
			);
			this.pendingTasks.delete(worker);
		}
		worker.terminate();
		this.replaceWorker(worker);
		this.processQueue();
	}

	private processQueue() {
		if (this.taskQueue.length === 0) {
			logger.debug("Task queue is empty.");
			return;
		}
		const availableWorker = this.workers.find((w) => !this.pendingTasks.has(w));
		if (!availableWorker) {
			logger.debug("All workers busy, task remains in queue.");
			return;
		}
		const { task, resolve, reject } = this.taskQueue.shift()!;
		logger.debug("Assigning task to an available worker.");
		this.pendingTasks.set(availableWorker, { resolve, reject });

		const timeout = setTimeout(() => {
			this.handleWorkerTimeout(availableWorker);
		}, WORKER_TIMEOUT_MS);
		this.timeouts.set(availableWorker, timeout);

		availableWorker.postMessage(task);
	}

	public run(taskData: TaskMessage): Promise<ResultMessage> {
		logger.debug("Adding new task to queue.");
		return new Promise((resolve, reject) => {
			this.taskQueue.push({ task: taskData, resolve, reject });
			this.processQueue();
		});
	}

	/**
	 * Gracefully shuts down the worker pool.
	 * Rejects all queued tasks, terminates all workers, and clears resources.
	 * This method is idempotent - calling it multiple times is safe.
	 */
	public shutdown(): void {
		logger.info("Shutting down worker pool...");

		// Reject all queued tasks
		while (this.taskQueue.length > 0) {
			const { reject } = this.taskQueue.shift()!;
			reject(new WorkerError("Worker pool is shutting down", "shutdown"));
		}

		// Clear all timeouts and terminate workers
		for (const [worker, timeout] of this.timeouts.entries()) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}

		// Terminate all workers
		for (const worker of this.workers) {
			worker.terminate();
		}

		// Clear pending tasks map
		this.pendingTasks.clear();

		logger.info("Worker pool shut down complete.");
	}

	/**
	 * Get current pool statistics (v1 compatibility)
	 */
	public getStats(): {
		totalWorkers: number;
		idleWorkers: number;
		busyWorkers: number;
		queuedTasks: number;
		pendingTasks: number;
	} {
		return {
			totalWorkers: this.workers.length,
			idleWorkers: this.workers.length - this.pendingTasks.size,
			busyWorkers: this.pendingTasks.size,
			queuedTasks: this.taskQueue.length,
			pendingTasks: this.pendingTasks.size,
		};
	}

	/**
	 * Get detailed information about each worker (v1 compatibility)
	 * Legacy WorkerPool doesn't track per-worker queues
	 */
	public getWorkerDetails(): Array<{
		workerId: number;
		queueLength: number;
		isIdle: boolean;
		lastActiveTime: number;
		idleDurationMs: number;
	}> {
		const now = Date.now();
		return this.workers.map((_, index) => ({
			workerId: index + 1,
			queueLength: this.pendingTasks.has(this.workers[index]) ? 1 : 0,
			isIdle: !this.pendingTasks.has(this.workers[index]),
			lastActiveTime: now,
			idleDurationMs: 0,
		}));
	}

	/**
	 * Get the current load factor (v1 compatibility)
	 */
	public getLoadFactor(): number {
		if (this.workers.length === 0) return 0;
		return this.pendingTasks.size / this.workers.length;
	}
}
