import { LOG_LEVELS, LogLevel } from "./types";
import { CONFIG } from "./config";

const globalLogLevel = CONFIG.LOG_LEVEL;
const globalLogLevelValue =
	globalLogLevel === "none"
		? Infinity
		: LOG_LEVELS[globalLogLevel as Exclude<LogLevel, "none">];
const logTemplate = CONFIG.LOG_TEMPLATE;

/**
 * Formats a timestamp according to the specified format
 * @param date - The date to format
 * @param format - The format type: 'unix', 'ISO', 'datetime', or default
 * @returns Formatted timestamp string
 */
function formatTimestamp(date: Date, format?: string): string {
	switch (format) {
		case "unix":
			return (date.getTime() / 1000).toFixed(3);
		case "ISO":
			return date.toISOString();
		case "datetime":
		default: {
			const day = String(date.getDate()).padStart(2, "0");
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const year = date.getFullYear();
			const hours = String(date.getHours()).padStart(2, "0");
			const minutes = String(date.getMinutes()).padStart(2, "0");
			const seconds = String(date.getSeconds()).padStart(2, "0");
			return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
		}
	}
}

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

		const now = new Date();

		const formattedMessage = logTemplate
			.replace(/{timestamp\((unix|ISO|datetime)\)}/g, (_, format) =>
				formatTimestamp(now, format),
			)
			.replace(/{timestamp}/g, formatTimestamp(now))
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
