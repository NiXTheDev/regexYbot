import { describe, test, expect } from "bun:test";
import {
	BotError,
	CircuitBreakerError,
	RateLimitError,
	WorkerError,
	isBotError,
	isCircuitBreakerError,
	isRateLimitError,
	isRegexError,
	isTelegramAPIError,
	isWorkerError,
	RegexError,
	TelegramAPIError,
} from "../errors";

describe("Error hierarchy", () => {
	test("RateLimitError carries user id and retry window", () => {
		const error = new RateLimitError(456, 15_000);
		expect(error.userId).toBe(456);
		expect(error.retryAfter).toBe(15_000);
		expect(error.getUserMessage()).toContain("15 second");
	});

	test("WorkerError keeps its operation label", () => {
		const error = new WorkerError(
			"Worker pool is shutting down",
			"shutdown",
			3,
		);
		expect(error.operation).toBe("shutdown");
		expect(error.workerId).toBe(3);
		expect(error.getUserMessage()).toContain("simpler pattern");
	});

	test("CircuitBreakerError names the service and remaining window", () => {
		const error = new CircuitBreakerError("telegram-send", Date.now() + 10_000);
		expect(error.service).toBe("telegram-send");
		expect(error.getUserMessage()).toContain("temporarily unavailable");
	});

	test("RegexError reports the offending pattern", () => {
		const error = new RegexError("(a+)+$", "g", new SyntaxError("oops"));
		expect(error.pattern).toBe("(a+)+$");
		expect(error.flags).toBe("g");
		expect(error.getUserMessage()).toContain("Invalid regex pattern");
	});

	test("TelegramAPIError maps status codes to user messages", () => {
		expect(
			new TelegramAPIError("x", "sendMessage", 429).getUserMessage(),
		).toContain("Rate limit");
		expect(
			new TelegramAPIError("x", "sendMessage", 502).getUserMessage(),
		).toContain(" experiencing issues");
	});

	test("BotError.getUserMessage falls back to the message", () => {
		expect(new BotError("plain failure", "GENERIC").getUserMessage()).toBe(
			"plain failure",
		);
	});

	test("type guards classify by concrete class", () => {
		const worker = new WorkerError("x", "regex_execution");
		const rate = new RateLimitError(1, 1_000);
		const breaker = new CircuitBreakerError(
			"telegram-send",
			Date.now() + 1_000,
		);
		const regex = new RegexError("a", "");
		const telegram = new TelegramAPIError("x", "sendMessage");
		const plain = new Error("not ours");

		expect(isWorkerError(worker)).toBe(true);
		expect(isWorkerError(plain)).toBe(false);

		expect(isRateLimitError(rate)).toBe(true);
		expect(isRateLimitError(plain)).toBe(false);

		expect(isCircuitBreakerError(breaker)).toBe(true);
		expect(isCircuitBreakerError(plain)).toBe(false);

		expect(isRegexError(regex)).toBe(true);
		expect(isRegexError(plain)).toBe(false);

		expect(isTelegramAPIError(telegram)).toBe(true);
		expect(isTelegramAPIError(plain)).toBe(false);

		// BotError itself: every subclass is one; plain Error is not.
		expect(isBotError(worker)).toBe(true);
		expect(isBotError(plain)).toBe(false);
	});
});
