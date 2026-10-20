import { describe, test, expect } from "bun:test";
import { CircuitBreaker } from "../circuitBreaker";
import { CircuitBreakerError } from "../errors";

describe("CircuitBreaker", () => {
	test("passes successful results through in the closed state", async () => {
		const breaker = new CircuitBreaker("telegram-send", {
			failureThreshold: 2,
			resetTimeoutMs: 50,
			successThreshold: 1,
		});

		await expect(breaker.execute(async () => 42)).resolves.toBe(42);
		expect(breaker.getState()).toBe("CLOSED");
		expect(breaker.getFailureCount()).toBe(0);
	});

	test("rethrows the original error and counts the failure", async () => {
		const breaker = new CircuitBreaker("worker", {
			failureThreshold: 3,
			resetTimeoutMs: 50,
			successThreshold: 1,
		});
		const boom = new Error("service down");

		await expect(
			breaker.execute(async () => {
				throw boom;
			}),
		).rejects.toBe(boom);
		expect(breaker.getFailureCount()).toBe(1);
	});

	test("opens after the failure threshold and rejects fast", async () => {
		const breaker = new CircuitBreaker("telegram-send", {
			failureThreshold: 2,
			resetTimeoutMs: 50,
			successThreshold: 1,
		});
		const failing = async () => {
			throw new Error("upstream unavailable");
		};

		await expect(breaker.execute(failing)).rejects.toThrow(
			"upstream unavailable",
		);
		await expect(breaker.execute(failing)).rejects.toThrow(
			"upstream unavailable",
		);
		expect(breaker.getState()).toBe("OPEN");

		// While open, requests are rejected without even calling fn.
		await expect(
			breaker.execute(async () => "should never run"),
		).rejects.toBeInstanceOf(CircuitBreakerError);
	});

	test("half-opens after the reset timeout and closes after enough successes", async () => {
		const breaker = new CircuitBreaker("telegram-send", {
			failureThreshold: 1,
			resetTimeoutMs: 10,
			successThreshold: 2,
		});
		await expect(
			breaker.execute(async () => {
				throw new Error("down");
			}),
		).rejects.toThrow("down");
		expect(breaker.getState()).toBe("OPEN");

		await new Promise((resolve) => setTimeout(resolve, 15));

		// First success probes the circuit (HALF_OPEN), second closes it.
		await expect(breaker.execute(async () => "ok1")).resolves.toBe("ok1");
		expect(breaker.getState()).toBe("HALF_OPEN");
		await expect(breaker.execute(async () => "ok2")).resolves.toBe("ok2");
		expect(breaker.getState()).toBe("CLOSED");
	});

	test("a failure while half-open re-opens the circuit", async () => {
		const breaker = new CircuitBreaker("telegram-send", {
			failureThreshold: 1,
			resetTimeoutMs: 10,
			successThreshold: 2,
		});
		await expect(
			breaker.execute(async () => {
				throw new Error("down");
			}),
		).rejects.toThrow("down");

		await new Promise((resolve) => setTimeout(resolve, 15));

		await expect(
			breaker.execute(async () => {
				throw new Error("still down");
			}),
		).rejects.toThrow("still down");

		await expect(
			breaker.execute(async () => "should never run"),
		).rejects.toBeInstanceOf(CircuitBreakerError);
	});

	test("reset() returns an open circuit to closed", async () => {
		const breaker = new CircuitBreaker("telegram-send", {
			failureThreshold: 1,
			resetTimeoutMs: 10_000,
			successThreshold: 1,
		});
		await expect(
			breaker.execute(async () => {
				throw new Error("down");
			}),
		).rejects.toThrow("down");
		expect(breaker.getState()).toBe("OPEN");

		breaker.reset();

		expect(breaker.getState()).toBe("CLOSED");
		await expect(breaker.execute(async () => "ok")).resolves.toBe("ok");
	});
});
