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
