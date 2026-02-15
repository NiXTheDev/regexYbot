// Define the available log levels in order of severity
export type LogLevel = "none" | "debug" | "info" | "warn" | "error" | "fatal";

// Assign a numeric value to each level for easy comparison
export const LOG_LEVELS: Record<Exclude<LogLevel, "none">, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

// Define the structure of the data sent to the worker
export interface SedCommand {
	pattern: string;
	flags: string;
	replacement: string;
}

export interface TaskMessage {
	initialText: string;
	commands: SedCommand[];
	includePerformance: boolean;
}

export interface ResultMessage {
	result: string;
	performanceMs: number | null;
	error?: string;
	taskId?: number;
}

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
