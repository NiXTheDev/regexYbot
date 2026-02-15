import { describe, test, expect } from "bun:test";
import { CONFIG } from "../config";

describe("Configuration", () => {
	describe("Required variables", () => {
		test("should have TOKEN defined", () => {
			expect(CONFIG.TOKEN).toBeDefined();
			expect(typeof CONFIG.TOKEN).toBe("string");
			expect(CONFIG.TOKEN.length).toBeGreaterThan(0);
		});
	});

	describe("Telegram API configuration", () => {
		test("should have BASE_URL with default value", () => {
			expect(CONFIG.BASE_URL).toBeDefined();
			expect(typeof CONFIG.BASE_URL).toBe("string");
			expect(CONFIG.BASE_URL).toMatch(/^https?:\/\//);
		});
	});

	describe("Logging configuration", () => {
		test("should have valid LOG_LEVEL", () => {
			expect(CONFIG.LOG_LEVEL).toBeDefined();
			expect(["none", "debug", "info", "warn", "error", "fatal"]).toContain(
				CONFIG.LOG_LEVEL,
			);
		});

		test("should have LOG_TEMPLATE defined", () => {
			expect(CONFIG.LOG_TEMPLATE).toBeDefined();
			expect(typeof CONFIG.LOG_TEMPLATE).toBe("string");
		});

		test("should have valid NODE_ENV", () => {
			expect(CONFIG.NODE_ENV).toBeDefined();
			expect(["development", "production", "test"]).toContain(CONFIG.NODE_ENV);
		});
	});

	describe("Worker Pool configuration", () => {
		test("should have positive WORKER_TIMEOUT_MS", () => {
			expect(CONFIG.WORKER_TIMEOUT_MS).toBeDefined();
			expect(CONFIG.WORKER_TIMEOUT_MS).toBeGreaterThan(0);
		});
	});

	describe("Worker Pool configuration", () => {
		test("should have valid min/max workers", () => {
			expect(CONFIG.WORKER_POOL_MIN_WORKERS).toBeGreaterThanOrEqual(0);
			expect(CONFIG.WORKER_POOL_MAX_WORKERS).toBeGreaterThanOrEqual(
				CONFIG.WORKER_POOL_MIN_WORKERS,
			);
		});

		test("should have valid initial workers", () => {
			expect(CONFIG.WORKER_POOL_INITIAL_WORKERS).toBeGreaterThanOrEqual(0);
			expect(CONFIG.WORKER_POOL_INITIAL_WORKERS).toBeLessThanOrEqual(
				CONFIG.WORKER_POOL_MAX_WORKERS,
			);
		});

		test("should have positive timeout values", () => {
			expect(CONFIG.WORKER_POOL_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
			expect(CONFIG.WORKER_POOL_IDLE_CHECK_INTERVAL_MS).toBeGreaterThan(0);
		});
	});

	describe("Graceful shutdown configuration", () => {
		test("should have valid GRACEFUL_DRAIN", () => {
			expect(typeof CONFIG.GRACEFUL_DRAIN).toBe("boolean");
		});

		test("should have valid GRACEFUL_DRAIN_TIMEOUT_MS", () => {
			expect(CONFIG.GRACEFUL_DRAIN_TIMEOUT_MS).toBeGreaterThan(0);
			// Should be less than typical Docker grace period (10s)
			expect(CONFIG.GRACEFUL_DRAIN_TIMEOUT_MS).toBeLessThanOrEqual(9500);
		});
	});

	describe("Message processing configuration", () => {
		test("should have positive MAX_CHAIN_LENGTH", () => {
			expect(CONFIG.MAX_CHAIN_LENGTH).toBeGreaterThan(0);
		});

		test("should have positive MAX_MESSAGE_LENGTH", () => {
			expect(CONFIG.MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
		});
	});

	describe("Database configuration", () => {
		test("should have positive CLEANUP_INTERVAL_MS", () => {
			expect(CONFIG.CLEANUP_INTERVAL_MS).toBeGreaterThan(0);
		});

		test("should have positive MAX_HISTORY_PER_CHAT", () => {
			expect(CONFIG.MAX_HISTORY_PER_CHAT).toBeGreaterThan(0);
		});

		test("should have positive HISTORY_QUERY_LIMIT", () => {
			expect(CONFIG.HISTORY_QUERY_LIMIT).toBeGreaterThan(0);
		});
	});

	describe("Retry configuration", () => {
		test("should have positive RETRY_MAX_RETRIES", () => {
			expect(CONFIG.RETRY_MAX_RETRIES).toBeGreaterThanOrEqual(0);
		});

		test("should have positive RETRY_MAX_DELAY_MS", () => {
			expect(CONFIG.RETRY_MAX_DELAY_MS).toBeGreaterThan(0);
		});
	});

	describe("Healthcheck configuration", () => {
		test("should have valid ENABLE_FILE_HEALTHCHECK", () => {
			expect(typeof CONFIG.ENABLE_FILE_HEALTHCHECK).toBe("boolean");
		});

		test("should have LIVENESS_FILE defined when healthcheck enabled", () => {
			if (CONFIG.ENABLE_FILE_HEALTHCHECK) {
				expect(CONFIG.LIVENESS_FILE).toBeDefined();
				expect(typeof CONFIG.LIVENESS_FILE).toBe("string");
				expect(CONFIG.LIVENESS_FILE.length).toBeGreaterThan(0);
			}
		});

		test("should have positive LIVENESS_INTERVAL_MS", () => {
			expect(CONFIG.LIVENESS_INTERVAL_MS).toBeGreaterThan(0);
		});
	});

	describe("Configuration immutability", () => {
		test("should not be modifiable", () => {
			expect(() => {
				(CONFIG as unknown as Record<string, unknown>).TOKEN = "modified";
			}).toThrow();
		});
	});
});
