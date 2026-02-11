import { describe, test, expect } from "bun:test";
import { spawn } from "node:child_process";

/**
 * Integration tests for graceful shutdown functionality
 * These tests verify that the bot handles SIGINT/SIGTERM properly
 *
 * Note: These tests require a valid TOKEN environment variable
 * If TOKEN is not set, tests will be skipped
 */

const TOKEN = process.env.TOKEN;
const describeOrSkip = TOKEN ? describe : describe.skip;

describeOrSkip("Graceful Shutdown Integration", () => {
	test("should exit cleanly on SIGTERM", async () => {
		const botProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "error",
				TOKEN: TOKEN!,
			},
			detached: false,
		});

		let exitCode: number | null = null;
		let stderr = "";
		let _stdout = "";

		botProcess.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		botProcess.stdout?.on("data", (data) => {
			_stdout += data.toString();
		});

		// Wait a bit for bot to start
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Send SIGTERM
		botProcess.kill("SIGTERM");

		// Wait for process to exit (with timeout)
		exitCode = await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				botProcess.kill("SIGKILL");
				resolve(null);
			}, 10000);

			botProcess.on("exit", (code) => {
				clearTimeout(timeout);
				resolve(code);
			});
		});

		expect(exitCode).toBe(0);
		expect(stderr).not.toContain("error");
		expect(stderr).not.toContain("Error");
	});

	test("should exit cleanly on SIGINT", async () => {
		const botProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "error",
				TOKEN: TOKEN!,
			},
			detached: false,
		});

		let exitCode: number | null = null;
		let stderr = "";

		botProcess.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		// Wait a bit for bot to start
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Send SIGINT (Ctrl+C)
		botProcess.kill("SIGINT");

		// Wait for process to exit (with timeout)
		exitCode = await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				botProcess.kill("SIGKILL");
				resolve(null);
			}, 10000);

			botProcess.on("exit", (code) => {
				clearTimeout(timeout);
				resolve(code);
			});
		});

		expect(exitCode).toBe(0);
		expect(stderr).not.toContain("error");
		expect(stderr).not.toContain("Error");
	});

	test("should handle multiple shutdown signals idempotently", async () => {
		const botProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "error",
				TOKEN: TOKEN!,
			},
			detached: false,
		});

		let exitCode: number | null = null;
		let _signalCount = 0;

		// Wait a bit for bot to start
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Send multiple signals rapidly
		botProcess.kill("SIGTERM");
		_signalCount++;

		await new Promise((resolve) => setTimeout(resolve, 100));

		botProcess.kill("SIGTERM");
		_signalCount++;

		// Wait for process to exit (with timeout)
		exitCode = await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				botProcess.kill("SIGKILL");
				resolve(null);
			}, 10000);

			botProcess.on("exit", (code) => {
				clearTimeout(timeout);
				resolve(code);
			});
		});

		// Should still exit cleanly even with multiple signals
		expect(exitCode).toBe(0);
	});
});
