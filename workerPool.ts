import { Logger } from "./logger";
import type { ResultMessage, TaskMessage } from "./types";
import { CONFIG } from "./config";

const logger = new Logger("WorkerPool");
const { WORKER_TIMEOUT_MS } = CONFIG;

export class WorkerPool {
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
		logger.error(error.error, "WORKER ERROR");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			pending.reject(error.error);
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
			pending.reject(
				new Error(`Regex operation timed out after ${WORKER_TIMEOUT_MS}ms`),
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
			reject(new Error("Worker pool is shutting down"));
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
	 * Drains the task queue by processing all pending tasks before shutting down.
	 * Creates additional workers temporarily to handle the backlog faster.
	 * Returns a promise that resolves when all tasks are complete.
	 */
	public async drainAndShutdown(): Promise<void> {
		const queueSize = this.taskQueue.length;
		const pendingSize = this.pendingTasks.size;

		if (queueSize === 0 && pendingSize === 0) {
			logger.info("No pending tasks, shutting down immediately.");
			this.shutdown();
			return;
		}

		logger.info(
			`Draining ${queueSize} queued tasks and ${pendingSize} pending tasks...`,
		);

		// Create additional workers to process the queue faster
		// We'll create up to queueSize additional workers (or at least 1 more)
		const additionalWorkers = Math.min(queueSize, 10); // Cap at 10 additional workers
		const tempWorkers: Worker[] = [];

		if (additionalWorkers > 0) {
			logger.info(
				`Scaling up by ${additionalWorkers} temporary workers to drain queue faster...`,
			);
			for (let i = 0; i < additionalWorkers; i++) {
				const worker = this.createWorker(
					this.workers.length + i + 1,
					this.workers.length + additionalWorkers,
				);
				tempWorkers.push(worker);
				this.workers.push(worker);
			}
			// Trigger queue processing with the new workers
			this.processQueue();
		}

		// Wait for all tasks to complete
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				const remaining = this.taskQueue.length + this.pendingTasks.size;
				if (remaining === 0) {
					clearInterval(checkInterval);
					logger.info("All tasks completed, shutting down...");

					// Remove temporary workers
					for (const tempWorker of tempWorkers) {
						const index = this.workers.indexOf(tempWorker);
						if (index !== -1) {
							this.workers.splice(index, 1);
							tempWorker.terminate();
						}
					}

					this.shutdown();
					resolve();
				} else {
					logger.debug(`Waiting for ${remaining} tasks to complete...`);
				}
			}, 100);

			// Safety timeout - force shutdown after 30 seconds
			setTimeout(() => {
				clearInterval(checkInterval);
				logger.warn("Drain timeout reached, forcing shutdown...");
				this.shutdown();
				resolve();
			}, 30000);
		});
	}
}
