// logger.ts
import { LogLevel, LOG_LEVELS } from "./types";

// Determine the global log level from environment variables
const getGlobalLogLevel = (): LogLevel => {
	const envLevel = process.env.LOG_LEVEL?.toLowerCase();
	if (
		envLevel === "none" ||
		envLevel === "debug" ||
		envLevel === "info" ||
		envLevel === "warn" ||
		envLevel === "error" ||
		envLevel === "fatal"
	) {
		return envLevel;
	}
	// Default to 'info' in production, 'debug' otherwise
	return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const globalLogLevel = getGlobalLogLevel();
const globalLogLevelValue =
	globalLogLevel === "none"
		? Infinity
		: LOG_LEVELS[globalLogLevel as Exclude<LogLevel, "none">];
const logTemplate =
	process.env.LOG_TEMPLATE || "[{level}: {module}]: {message}";

export class Logger {
	private moduleName: string;
	constructor(moduleName: string) {
		this.moduleName = moduleName;
	}

	private log(
		level: Exclude<LogLevel, "none">,
		message: string,
		...args: any[]
	) {
		// If the global level is 'none', do nothing.
		if (globalLogLevel === "none") return;

		if (LOG_LEVELS[level] < globalLogLevelValue) return;

		const formattedMessage = logTemplate
			.replace("{level}", level.toUpperCase())
			.replace("{module}", this.moduleName)
			.replace("{message}", message);

		// Use console.error for errors and fatals, console.log for everything else
		const output =
			level === "error" || level === "fatal" ? console.error : console.log;
		output(formattedMessage, ...args);
	}

	public debug(message: string, ...args: any[]) {
		this.log("debug", message, ...args);
	}
	public info(message: string, ...args: any[]) {
		this.log("info", message, ...args);
	}
	public warn(message: string, ...args: any[]) {
		this.log("warn", message, ...args);
	}
	public error(message: string, ...args: any[]) {
		this.log("error", message, ...args);
	}

	/**
	 * Logs a fatal error and exits the process.
	 * @param message - The message to log.
	 * @param args - Additional arguments to pass to the console.
	 */
	public fatal(message: string, ...args: any[]) {
		this.log("fatal", message, ...args);
		process.exit(1);
	}
}
