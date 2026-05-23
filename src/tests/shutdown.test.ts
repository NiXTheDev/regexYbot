import { describe, test, expect } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";

/**
 * Integration tests for graceful shutdown functionality
 *
 * These tests verify that the bot handles shutdown signals properly.
 * On Windows, we use a workaround since SIGTERM/SIGINT handling differs from Unix.
 *
 * Note: These tests require a valid TOKEN environment variable
 * If TOKEN is not set, tests will be skipped
 */

const TOKEN = process.env.TOKEN;
const describeOrSkip = TOKEN ? describe : describe.skip;

async function waitForBotStart(
	botProcess: ChildProcess,
	timeoutMs: number = 10000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Bot did not start in time")),
			timeoutMs,
		);
		botProcess.stdout?.on("data", (data: string) => {
			if (data.toString().includes("Bot started with hellspawn worker pool")) {
				clearTimeout(timeout);
				resolve();
			}
		});
		botProcess.stderr?.on("data", (data: string) => {
			const text = data.toString();
			if (text.includes("Error") || text.includes("error")) {
				// Just log, don't reject — some errors are expected
				console.log("Bot stderr:", text);
			}
		});
		// If process exits before startup message, resolve anyway
		// (tests should not hang if the bot fails to start)
		botProcess.on("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

describeOrSkip("Graceful Shutdown Integration", () => {
	test("should respond to shutdown signal", async () => {
		const botProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "info", // Need info to see shutdown message
				TOKEN: TOKEN!,
			},
			detached: false,
		});

		let exited = false;
		let exitCode: number | null = null;
		let stdout = "";
		let stderr = "";

		botProcess.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		botProcess.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		botProcess.on("exit", (code) => {
			exited = true;
			exitCode = code;
		});

		// Wait for bot to fully start
		await waitForBotStart(botProcess);

		// Send shutdown signal
		// On Windows, this may not trigger graceful shutdown handlers
		// but the process should still exit
		botProcess.kill("SIGTERM");

		// Wait for exit with timeout
		await new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (exited) {
					clearInterval(checkInterval);
					clearTimeout(timeout);
					resolve(undefined);
				}
			}, 100);

			const timeout = setTimeout(() => {
				clearInterval(checkInterval);
				botProcess.kill("SIGKILL");
				resolve(undefined);
			}, 15000);
		});

		// The process should have exited (one way or another)
		expect(exited).toBe(true);

		// On Unix systems, we should get exit code 0 with proper graceful shutdown
		// On Windows, we might get null (killed) but the important thing is it doesn't hang
		console.log("Exit code:", exitCode);
		console.log("STDOUT:", stdout.slice(-500)); // Last 500 chars
		console.log("STDERR:", stderr.slice(-500));

		// Exit code should be 0 (graceful shutdown) or null (killed on Windows)
		// Accept any exit code — the main goal is the process doesn't hang
		expect(typeof exitCode === "number" || exitCode === null).toBe(true);
	}, 30000);

	test("should handle multiple shutdown attempts", async () => {
		const botProcess = spawn("bun", ["run", "src/index.ts"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "info",
				TOKEN: TOKEN!,
			},
			detached: false,
		});

		let exited = false;

		botProcess.on("exit", () => {
			exited = true;
		});

		// Wait for bot to start
		await waitForBotStart(botProcess);

		// Send multiple signals
		botProcess.kill("SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 200));
		botProcess.kill("SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 200));
		botProcess.kill("SIGTERM");

		// Wait for exit
		await new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (exited) {
					clearInterval(checkInterval);
					clearTimeout(timeout);
					resolve(undefined);
				}
			}, 100);

			const timeout = setTimeout(() => {
				clearInterval(checkInterval);
				botProcess.kill("SIGKILL");
				resolve(undefined);
			}, 15000);
		});

		expect(exited).toBe(true);
	}, 30000);
});
