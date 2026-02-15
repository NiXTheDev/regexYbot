import type { TaskMessage, ResultMessage } from "./types";

/**
 * Common interface for worker pool implementation
 */
export interface IWorkerPool {
	/**
	 * Submit a task to the worker pool
	 */
	run(taskData: TaskMessage): Promise<ResultMessage>;

	/**
	 * Graceful shutdown
	 * @param options - Optional shutdown configuration
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
