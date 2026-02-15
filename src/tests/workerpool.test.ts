import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { WorkerPool } from "../workerPool";
import { TaskMessage } from "../types";

describe("WorkerPool", () => {
	let pool: WorkerPool;

	beforeEach(() => {
		pool = new WorkerPool({
			maxWorkers: 4,
			minWorkers: 1,
			initialWorkers: 1,
			taskTimeoutMs: 5000,
			idleTimeoutMs: 100,
			idleCheckIntervalMs: 50,
			workerScript: "./src/hellspawn.ts",
		});
	});

	afterEach(async () => {
		await pool.shutdown();
	});

	test("basic task execution", async () => {
		const task: TaskMessage = {
			initialText: "hello world",
			commands: [{ pattern: "hello", flags: "", replacement: "hi" }],
			includePerformance: false,
		};

		const result = await pool.run(task);
		expect(result.result).toBe("hi world");
		expect(result.error).toBeUndefined();
	});

	test("scale up when tasks queue", async () => {
		const task: TaskMessage = {
			initialText: "test",
			commands: [{ pattern: "test", flags: "", replacement: "done" }],
			includePerformance: false,
		};

		// Submit 10 tasks without awaiting to build queue
		const promises = Array(10)
			.fill(null)
			.map(() => pool.run(task));

		// Allow time for workers to spawn
		await new Promise((resolve) => setTimeout(resolve, 100));

		const stats = pool.getStats();
		// Should have scaled up to max workers
		expect(stats.totalWorkers).toBe(4);

		await Promise.all(promises);
	});

	test("scale down idle workers", async () => {
		// Run some tasks to scale up
		const task: TaskMessage = {
			initialText: "test",
			commands: [{ pattern: "test", flags: "", replacement: "done" }],
			includePerformance: false,
		};

		await Promise.all(
			Array(5)
				.fill(null)
				.map(() => pool.run(task)),
		);

		// Wait for idle timeout + check interval
		await new Promise((resolve) => setTimeout(resolve, 200));

		const stats = pool.getStats();
		expect(stats.totalWorkers).toBe(1); // Back to min
	});

	test("respects max workers limit", async () => {
		const limitedPool = new WorkerPool({
			maxWorkers: 2,
			minWorkers: 1,
			initialWorkers: 1,
			taskTimeoutMs: 5000,
			idleTimeoutMs: 100,
			idleCheckIntervalMs: 50,
			workerScript: "./src/hellspawn.ts",
		});

		try {
			const task: TaskMessage = {
				initialText: "test",
				commands: [{ pattern: "test", flags: "", replacement: "done" }],
				includePerformance: false,
			};

			// Submit many tasks
			const promises = Array(20)
				.fill(null)
				.map(() => limitedPool.run(task));

			await new Promise((resolve) => setTimeout(resolve, 50));

			const stats = limitedPool.getStats();
			expect(stats.totalWorkers).toBeLessThanOrEqual(2);

			await Promise.all(promises);
		} finally {
			await limitedPool.shutdown();
		}
	});

	test("handles invalid regex errors", async () => {
		const task: TaskMessage = {
			initialText: "test",
			commands: [{ pattern: "[invalid", flags: "", replacement: "fixed" }],
			includePerformance: false,
		};

		await expect(pool.run(task)).rejects.toThrow();
	});

	test("pool continues working after errors", async () => {
		const validTask: TaskMessage = {
			initialText: "hello",
			commands: [{ pattern: "hello", flags: "", replacement: "hi" }],
			includePerformance: false,
		};

		const invalidTask: TaskMessage = {
			initialText: "test",
			commands: [{ pattern: "[invalid", flags: "", replacement: "fixed" }],
			includePerformance: false,
		};

		// Valid task works
		const result1 = await pool.run(validTask);
		expect(result1.result).toBe("hi");

		// Invalid task fails
		await expect(pool.run(invalidTask)).rejects.toThrow();

		// Pool still works
		const result2 = await pool.run(validTask);
		expect(result2.result).toBe("hi");
	});

	test("returns pool statistics", async () => {
		const stats = pool.getStats();
		expect(typeof stats.totalWorkers).toBe("number");
		expect(typeof stats.idleWorkers).toBe("number");
		expect(typeof stats.busyWorkers).toBe("number");
		expect(typeof stats.queuedTasks).toBe("number");
		expect(typeof stats.pendingTasks).toBe("number");
	});

	test("rejects new tasks during shutdown", async () => {
		const task: TaskMessage = {
			initialText: "test",
			commands: [{ pattern: "test", flags: "", replacement: "done" }],
			includePerformance: false,
		};

		// Start shutdown
		const shutdownPromise = pool.shutdown();

		// New tasks should be rejected during shutdown
		await expect(pool.run(task)).rejects.toThrow(
			"Worker pool is shutting down",
		);

		await shutdownPromise;

		// Mark as shut down so afterEach doesn't fail
		pool["isShuttingDown"] = true;
	});

	test("scales past maxWorkers during shutdown with draining", async () => {
		// Create pool with very low maxWorkers
		const drainPool = new WorkerPool({
			maxWorkers: 2,
			minWorkers: 1,
			initialWorkers: 1,
			taskTimeoutMs: 5000,
			idleTimeoutMs: 100,
			idleCheckIntervalMs: 50,
			workerScript: "./src/hellspawn.ts",
		});

		let maxWorkersDuringShutdown = 0;

		try {
			// Use larger text to make tasks take longer
			const largeText = "hello ".repeat(1000);
			const task: TaskMessage = {
				initialText: largeText,
				commands: [{ pattern: "hello", flags: "g", replacement: "hi" }],
				includePerformance: false,
			};

			// Queue many tasks rapidly (15 tasks with large text)
			const promises = Array(15)
				.fill(null)
				.map(() => drainPool.run(task));

			// Very small delay - just enough for tasks to enter queue
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Get stats before shutdown - should be at maxWorkers (2)
			const statsBefore = drainPool.getStats();
			expect(statsBefore.totalWorkers).toBeLessThanOrEqual(2);

			// Verify there are still queued tasks before shutdown
			expect(
				statsBefore.queuedTasks + statsBefore.pendingTasks,
			).toBeGreaterThan(0);

			// Track max workers during shutdown
			const checkInterval = setInterval(() => {
				const stats = drainPool.getStats();
				if (stats.totalWorkers > maxWorkersDuringShutdown) {
					maxWorkersDuringShutdown = stats.totalWorkers;
				}
			}, 10);

			// Shutdown with draining - this should spawn extra workers beyond maxWorkers
			await drainPool.shutdown({ drainTasks: true, drainTimeoutMs: 5000 });

			clearInterval(checkInterval);

			// Verify that during shutdown we scaled past maxWorkers (2)
			expect(maxWorkersDuringShutdown).toBeGreaterThan(2);

			// All tasks should complete
			const results = await Promise.all(promises);
			expect(results).toHaveLength(15);

			// Mark as shut down
			drainPool["isShuttingDown"] = true;
		} finally {
			if (!drainPool["isShuttingDown"]) {
				await drainPool.shutdown();
			}
		}
	});
});
