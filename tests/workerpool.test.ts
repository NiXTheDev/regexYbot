import { describe, test, expect, beforeEach } from "bun:test";
import { TaskMessage, ResultMessage } from "../types";

class MockWorkerPool {
	private workers: Worker[];
	private taskQueue: Array<{
		task: TaskMessage;
		resolve: (value: ResultMessage) => void;
		reject: (reason?: unknown) => void;
	}> = [];
	private pendingTasks = new Map<
		Worker,
		{
			resolve: (value: ResultMessage) => void;
			reject: (reason?: unknown) => void;
		}
	>();
	private workerScript: string;
	private timeouts: Map<Worker, NodeJS.Timeout>;
	private maxConcurrency: number;
	private taskResults: Map<number, ResultMessage> = new Map();
	private taskCounter = 0;
	private useMockWorker: boolean;

	constructor(poolSize: number, workerScript: string, useMockWorker = true) {
		this.workerScript = workerScript;
		this.maxConcurrency = poolSize;
		this.timeouts = new Map();
		this.useMockWorker = useMockWorker;
		this.workers = [];

		if (useMockWorker) {
			for (let i = 0; i < poolSize; i++) {
				this.workers.push({} as Worker);
			}
		}
	}

	processQueue(): void {
		if (this.taskQueue.length === 0) {
			return;
		}

		const availableWorkers = this.workers.filter(
			(w) => !this.pendingTasks.has(w),
		);
		if (availableWorkers.length === 0) {
			return;
		}

		const availableWorker = availableWorkers[0];
		const { task, resolve, reject } = this.taskQueue.shift()!;
		this.pendingTasks.set(availableWorker, { resolve, reject });

		const taskId = ++this.taskCounter;
		const timeout = setTimeout(() => {
			const result = this.executeTask(task, taskId);
			this.handleWorkerMessage(availableWorker, result);
		}, 50);
		this.timeouts.set(availableWorker, timeout);
	}

	run(taskData: TaskMessage): Promise<ResultMessage> {
		return new Promise((resolve, reject) => {
			this.taskQueue.push({ task: taskData, resolve, reject });
			this.processQueue();
		});
	}

	getQueueLength(): number {
		return this.taskQueue.length;
	}

	getPendingCount(): number {
		return this.pendingTasks.size;
	}

	isBusy(): boolean {
		return this.pendingTasks.size >= this.workers.length;
	}

	clearQueue(): void {
		this.taskQueue = [];
	}

	private handleWorkerMessage(worker: Worker, result: ResultMessage) {
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}

		const pending = this.pendingTasks.get(worker);
		if (pending) {
			pending.resolve(result);
			this.pendingTasks.delete(worker);
		}

		this.processQueue();
	}

	private executeTask(task: TaskMessage, __taskId: number): ResultMessage {
		const startTime = task.includePerformance ? performance.now() : undefined;
		try {
			let currentText = task.initialText;
			for (const cmd of task.commands) {
				const regex = new RegExp(cmd.pattern, cmd.flags);
				currentText = currentText.replace(regex, cmd.replacement);
			}
			let performanceMs: number | null = null;
			if (task.includePerformance && startTime !== undefined) {
				performanceMs = performance.now() - startTime;
			}
			return { result: currentText, performanceMs };
		} catch (error) {
			return { result: "", performanceMs: null, error: String(error) };
		}
	}
}

describe("WorkerPool", () => {
	let pool: MockWorkerPool;

	beforeEach(() => {
		pool = new MockWorkerPool(4, "../hellspawn.ts");
	});

	describe("processQueue", () => {
		test("should return immediately when queue is empty", () => {
			const initialQueue = pool.getQueueLength();
			pool.processQueue();
			expect(pool.getQueueLength()).toBe(initialQueue);
		});

		test("should process task when worker is available", async () => {
			const task: TaskMessage = {
				initialText: "hello world",
				commands: [{ pattern: "hello", flags: "g", replacement: "hi" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("hi world");
		});

		test("should handle multiple sequential tasks", async () => {
			const task1: TaskMessage = {
				initialText: "foo bar",
				commands: [{ pattern: "foo", flags: "", replacement: "baz" }],
				includePerformance: false,
			};

			const task2: TaskMessage = {
				initialText: "test",
				commands: [{ pattern: "test", flags: "", replacement: "passed" }],
				includePerformance: false,
			};

			const [result1, result2] = await Promise.all([
				pool.run(task1),
				pool.run(task2),
			]);

			expect(result1.result).toBe("baz bar");
			expect(result2.result).toBe("passed");
		});

		test("should queue tasks when all workers are busy", async () => {
			const pool = new MockWorkerPool(1, "../hellspawn.ts");

			const slowTask: TaskMessage = {
				initialText: "slow task",
				commands: [{ pattern: "slow", flags: "", replacement: "fast" }],
				includePerformance: false,
			};

			const fastTask: TaskMessage = {
				initialText: "quick task",
				commands: [{ pattern: "quick", flags: "", replacement: "instant" }],
				includePerformance: false,
			};

			const slowResultPromise = pool.run(slowTask);
			expect(pool.getQueueLength()).toBe(0);

			const fastResultPromise = pool.run(fastTask);
			expect(pool.getQueueLength()).toBe(1);

			const slowResult = await slowResultPromise;
			const fastResult = await fastResultPromise;

			expect(slowResult.result).toBe("fast task");
			expect(fastResult.result).toBe("instant task");
		});

		test("should handle multiple regex commands in sequence", async () => {
			const task: TaskMessage = {
				initialText: "hello world from typescript",
				commands: [
					{ pattern: "hello", flags: "", replacement: "greetings" },
					{ pattern: "from", flags: "", replacement: "built with" },
				],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("greetings world built with typescript");
		});

		test("should handle regex with global flag", async () => {
			const task: TaskMessage = {
				initialText: "foo foo foo",
				commands: [{ pattern: "foo", flags: "g", replacement: "bar" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("bar bar bar");
		});

		test("should handle regex with case insensitive flag", async () => {
			const task: TaskMessage = {
				initialText: "Hello HELLO hello",
				commands: [{ pattern: "hello", flags: "gi", replacement: "hi" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("hi hi hi");
		});

		test("should return error for invalid regex", async () => {
			const task: TaskMessage = {
				initialText: "test",
				commands: [{ pattern: "[unclosed", flags: "", replacement: "valid" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.error).toBeDefined();
		});

		test("should preserve performanceMs in result when requested", async () => {
			const task: TaskMessage = {
				initialText: "some text to process",
				commands: [{ pattern: "some", flags: "", replacement: "more" }],
				includePerformance: true,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("more text to process");
			expect(result.performanceMs).not.toBeNull();
		});

		test("should have null performanceMs when not requested", async () => {
			const task: TaskMessage = {
				initialText: "some text",
				commands: [{ pattern: "some", flags: "", replacement: "more" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.performanceMs).toBeNull();
		});

		test("should handle empty replacement string", async () => {
			const task: TaskMessage = {
				initialText: "hello world",
				commands: [{ pattern: "hello ", flags: "", replacement: "" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("world");
		});

		test("should handle replacement with capture groups", async () => {
			const task: TaskMessage = {
				initialText: "john doe",
				commands: [
					{ pattern: "(\\w+) (\\w+)", flags: "", replacement: "$2 $1" },
				],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("doe john");
		});

		test("should handle empty initial text", async () => {
			const task: TaskMessage = {
				initialText: "",
				commands: [{ pattern: "test", flags: "", replacement: "replaced" }],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("");
		});

		test("should handle task with no matching pattern", async () => {
			const task: TaskMessage = {
				initialText: "hello world",
				commands: [
					{ pattern: "nonexistent", flags: "", replacement: "replaced" },
				],
				includePerformance: false,
			};

			const result = await pool.run(task);
			expect(result.result).toBe("hello world");
		});
	});

	describe("concurrency", () => {
		test("should process multiple tasks concurrently up to pool size", async () => {
			const pool = new MockWorkerPool(2, "../hellspawn.ts");

			const longTask: TaskMessage = {
				initialText: "slow task",
				commands: [{ pattern: "slow", flags: "", replacement: "fast" }],
				includePerformance: false,
			};

			const tasks = Array(5).fill(longTask);
			const results = await Promise.all(tasks.map((t) => pool.run(t)));

			expect(results.every((r) => r.result === "fast task")).toBe(true);
		});
	});
});
