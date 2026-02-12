import type { TaskMessage, ResultMessage } from "./types";

/**
 * Common interface for all worker pool implementations
 * Both WorkerPool (v1) and WorkerPoolV2 implement this interface
 */
export interface IWorkerPool {
	/**
	 * Submit a task to the worker pool
	 */
	run(taskData: TaskMessage): Promise<ResultMessage>;

	/**
	 * Graceful shutdown
	 * @param options - Optional shutdown configuration (WorkerPoolV2 supports drainTasks)
	 */
	shutdown(options?: {
		drainTasks?: boolean;
		drainTimeoutMs?: number;
	}): void | Promise<void>;

	/**
	 * Get current pool statistics
	 */
	getStats?(): {
		totalWorkers: number;
		idleWorkers: number;
		busyWorkers: number;
		queuedTasks: number;
		pendingTasks: number;
	};

	/**
	 * Get detailed information about each worker
	 */
	getWorkerDetails?(): Array<{
		workerId: number;
		isIdle: boolean;
		isProcessing?: boolean;
		lastActiveTime: number;
		idleDurationMs: number;
	}>;

	/**
	 * Get the current load factor (0.0 to 1.0)
	 */
	getLoadFactor?(): number;
}
