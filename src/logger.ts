import { LogLevel } from "./types";
import { CONFIG, isLogLevelEnabled } from "./config";
import { AsyncLocalStorage } from "node:async_hooks";

const logTemplate = CONFIG.LOG_TEMPLATE;

/**
 * AsyncLocalStorage for correlation IDs
 * Tracks the current operation context across async calls
 */
const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Generate a short unique correlation ID
 * Format: timestamp-random (e.g., "abc123-def456")
 */
function generateCorrelationId(): string {
	const timestamp = Date.now().toString(36).slice(-6);
	const random = Math.random().toString(36).slice(2, 8);
	return `${timestamp}-${random}`;
}

/**
 * Run a function within a correlation context
 * All logs inside the function will include this correlation ID
 */
export function withCorrelation<T>(fn: () => T): T {
	const cid = generateCorrelationId();
	return correlationStorage.run(cid, fn);
}

/**
 * Get the current correlation ID, if any
 */
export function getCorrelationId(): string | undefined {
	return correlationStorage.getStore();
}

/**
 * Pad a number to two digits for timestamp components
 */
function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Format the value of a {timestamp} placeholder in the log template.
 *
 * Supported forms (documented in .env.example):
 * - `datetime` (also used for the bare `{timestamp}` token) — local
 *   time as DD/MM/YYYY HH:mm:ss
 * - `unix` — Unix seconds with millisecond precision (e.g. 1707312345.123)
 * - `ISO` — ISO 8601 (e.g. 2024-02-07T12:39:05.123Z)
 *
 * Unknown formats are returned unchanged so misconfigurations are visible
 * in the output instead of silently disappearing.
 */
export function formatLogTimestamp(format: string): string {
	const now = new Date();
	switch (format) {
		case "unix":
			return (now.getTime() / 1000).toFixed(3);
		case "ISO":
			return now.toISOString();
		case "datetime":
		case "":
			return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
		default:
			return `{timestamp(${format})}`;
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
		// Emit only when the configured global level allows it.
		if (!isLogLevelEnabled(level)) return;

		const cid = getCorrelationId();

		// Timestamps are replaced before {message} so placeholder text inside
		// log messages is never rewritten.
		const formattedMessage = logTemplate
			.replace(/\{timestamp\(([^)]*)\)\}/g, (_, format: string) =>
				formatLogTimestamp(format),
			)
			.replace(/\{timestamp\}/g, formatLogTimestamp("datetime"))
			.replace("{level}", level.toUpperCase())
			.replace("{module}", this.moduleName)
			.replace("{message}", message)
			.replace(/{cid(:short)?}/g, cid || "-")
			.replace(/{cid:full}/g, cid || "no-correlation-id");

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
