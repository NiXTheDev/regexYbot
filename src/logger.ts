import { LOG_LEVELS, LogLevel } from "./types";
import { CONFIG } from "./config";

const globalLogLevel = CONFIG.LOG_LEVEL;
const globalLogLevelValue =
	globalLogLevel === "none"
		? Infinity
		: LOG_LEVELS[globalLogLevel as Exclude<LogLevel, "none">];
const logTemplate = CONFIG.LOG_TEMPLATE;

export class Logger {
	private moduleName: string;
	constructor(moduleName: string) {
		this.moduleName = moduleName;
	}

	private log(
		level: Exclude<LogLevel, "none">,
		message: string,
		...args: unknown[]
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

	public debug(message: string, ...args: unknown[]) {
		this.log("debug", message, ...args);
	}
	public info(message: string, ...args: unknown[]) {
		this.log("info", message, ...args);
	}
	public warn(message: string, ...args: unknown[]) {
		this.log("warn", message, ...args);
	}
	public error(message: string, ...args: unknown[]) {
		this.log("error", message, ...args);
	}

	/**
	 * Logs a fatal error and exits the process.
	 * @param message - The message to log.
	 * @param args - Additional arguments to pass to the console.
	 */
	public fatal(message: string, ...args: unknown[]) {
		this.log("fatal", message, ...args);
		process.exit(1);
	}
}
