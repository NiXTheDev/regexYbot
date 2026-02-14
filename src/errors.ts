/**
 * Custom error hierarchy for regexYbot
 *
 * Provides granular error types with context and user-friendly messages
 */

/**
 * Base error class for all bot errors
 */
export class BotError extends Error {
	readonly code: string;
	readonly isOperational: boolean;
	readonly context?: Record<string, unknown>;

	constructor(
		message: string,
		code: string,
		isOperational = true,
		context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "BotError";
		this.code = code;
		this.isOperational = isOperational;
		this.context = context;
		Error.captureStackTrace(this, this.constructor);
	}

	/**
	 * Get user-friendly error message
	 */
	getUserMessage(): string {
		return this.message;
	}
}

/**
 * Error for invalid regex patterns
 */
export class RegexError extends BotError {
	readonly pattern: string;
	readonly flags: string;

	constructor(pattern: string, flags: string, originalError?: Error) {
		super(
			`Invalid regex pattern: "${pattern}"${originalError ? ` - ${originalError.message}` : ""}`,
			"REGEX_INVALID",
			true,
			{ pattern, flags, originalError: originalError?.message },
		);
		this.name = "RegexError";
		this.pattern = pattern;
		this.flags = flags;
	}

	getUserMessage(): string {
		return `❌ Invalid regex pattern. Check your syntax and try again.`;
	}
}

/**
 * Error for Telegram API failures
 */
export class TelegramAPIError extends BotError {
	readonly method: string;
	readonly statusCode?: number;
	readonly retryable: boolean;

	constructor(
		message: string,
		method: string,
		statusCode?: number,
		retryable = false,
		context?: Record<string, unknown>,
	) {
		super(message, `TELEGRAM_${statusCode || "API_ERROR"}`, true, {
			method,
			statusCode,
			...context,
		});
		this.name = "TelegramAPIError";
		this.method = method;
		this.statusCode = statusCode;
		this.retryable = retryable;
	}

	getUserMessage(): string {
		if (this.statusCode === 429) {
			return "⏳ Rate limit hit. Please wait a moment before trying again.";
		}
		if (this.statusCode && this.statusCode >= 500) {
			return "🔧 Telegram is having issues. Please try again in a moment.";
		}
		return "❌ Something went wrong. Please try again.";
	}
}

/**
 * Error for user rate limiting
 */
export class RateLimitError extends BotError {
	readonly userId: number;
	readonly retryAfter: number;

	constructor(userId: number, retryAfter: number) {
		super(
			`User ${userId} rate limited. Retry after ${retryAfter}ms`,
			"RATE_LIMITED",
			true,
			{ userId, retryAfter },
		);
		this.name = "RateLimitError";
		this.userId = userId;
		this.retryAfter = retryAfter;
	}

	getUserMessage(): string {
		const seconds = Math.ceil(this.retryAfter / 1000);
		return `⏳ You're sending commands too fast. Please wait ${seconds} second${seconds !== 1 ? "s" : ""}.`;
	}
}

/**
 * Error for worker pool issues
 */
export class WorkerError extends BotError {
	readonly workerId?: number;
	readonly operation: string;

	constructor(
		message: string,
		operation: string,
		workerId?: number,
		context?: Record<string, unknown>,
	) {
		super(message, "WORKER_ERROR", true, { operation, workerId, ...context });
		this.name = "WorkerError";
		this.operation = operation;
		this.workerId = workerId;
	}

	getUserMessage(): string {
		return "🔧 Processing error. Please try again with a simpler pattern.";
	}
}

/**
 * Error for circuit breaker open state
 */
export class CircuitBreakerError extends BotError {
	readonly service: string;
	readonly openUntil: number;

	constructor(service: string, openUntil: number) {
		super(
			`Circuit breaker open for ${service} until ${new Date(openUntil).toISOString()}`,
			"CIRCUIT_OPEN",
			true,
			{ service, openUntil },
		);
		this.name = "CircuitBreakerError";
		this.service = service;
		this.openUntil = openUntil;
	}

	getUserMessage(): string {
		return "🔧 Service temporarily unavailable. Please try again later.";
	}
}

/**
 * Type guard functions for error checking
 */
export function isBotError(error: unknown): error is BotError {
	return error instanceof BotError;
}

export function isRegexError(error: unknown): error is RegexError {
	return error instanceof RegexError;
}

export function isTelegramAPIError(error: unknown): error is TelegramAPIError {
	return error instanceof TelegramAPIError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
	return error instanceof RateLimitError;
}

export function isWorkerError(error: unknown): error is WorkerError {
	return error instanceof WorkerError;
}

export function isCircuitBreakerError(
	error: unknown,
): error is CircuitBreakerError {
	return error instanceof CircuitBreakerError;
}
