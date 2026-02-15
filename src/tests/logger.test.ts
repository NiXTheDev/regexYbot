import { describe, test, expect } from "bun:test";
import { Logger, withCorrelation, getCorrelationId } from "../logger";

describe("Logger Correlation IDs", () => {
	describe("withCorrelation", () => {
		test("should generate correlation ID for synchronous function", () => {
			let capturedCid: string | undefined;

			withCorrelation(() => {
				capturedCid = getCorrelationId();
			});

			expect(capturedCid).toBeDefined();
			expect(typeof capturedCid).toBe("string");
			expect(capturedCid?.length).toBeGreaterThan(0);
		});

		test("should generate correlation ID for async function", async () => {
			let capturedCid: string | undefined;

			await withCorrelation(async () => {
				capturedCid = getCorrelationId();
			});

			expect(capturedCid).toBeDefined();
			expect(typeof capturedCid).toBe("string");
		});

		test("should return function result", () => {
			const result = withCorrelation(() => {
				return "test result";
			});

			expect(result).toBe("test result");
		});

		test("should return async function result", async () => {
			const result = await withCorrelation(async () => {
				return "async result";
			});

			expect(result).toBe("async result");
		});

		test("should have different correlation IDs for nested calls", () => {
			let outerCid: string | undefined;
			let innerCid: string | undefined;

			withCorrelation(() => {
				outerCid = getCorrelationId();
				withCorrelation(() => {
					innerCid = getCorrelationId();
				});
			});

			expect(outerCid).toBeDefined();
			expect(innerCid).toBeDefined();
			expect(outerCid).not.toBe(innerCid);
		});
	});

	describe("getCorrelationId", () => {
		test("should return undefined outside of correlation context", () => {
			const cid = getCorrelationId();
			expect(cid).toBeUndefined();
		});

		test("should return same ID within same context", () => {
			let cid1: string | undefined;
			let cid2: string | undefined;

			withCorrelation(() => {
				cid1 = getCorrelationId();
				cid2 = getCorrelationId();
			});

			expect(cid1).toBe(cid2);
		});
	});

	describe("Logger with correlation", () => {
		test("should have correlation ID accessible within context", () => {
			let cid: string | undefined;

			withCorrelation(() => {
				cid = getCorrelationId();
				const logger = new Logger("Test");
				logger.info("test message");
			});

			expect(cid).toBeDefined();
			expect(cid?.length).toBeGreaterThan(0);
		});

		test("should handle different log levels", () => {
			const logger = new Logger("Test");

			expect(() => {
				withCorrelation(() => {
					logger.debug("debug");
					logger.info("info");
					logger.warn("warn");
					logger.error("error");
				});
			}).not.toThrow();
		});
	});

	describe("Correlation ID format", () => {
		test("should have timestamp and random parts", () => {
			let cid: string | undefined;

			withCorrelation(() => {
				cid = getCorrelationId();
			});

			expect(cid).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
		});

		test("should be unique across multiple calls", () => {
			const ids = new Set<string>();

			for (let i = 0; i < 100; i++) {
				withCorrelation(() => {
					const cid = getCorrelationId();
					if (cid) ids.add(cid);
				});
			}

			expect(ids.size).toBe(100);
		});
	});
});
