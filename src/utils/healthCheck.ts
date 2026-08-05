import { type ChildProcess } from "node:child_process";

export interface IsBotReadyOptions {
	process: ChildProcess;
	timeoutMs?: number;
	startupPattern?: RegExp;
}

/**
 * Checks if a bot process is ready by monitoring multiple signals:
 * 1. Is the process still alive? (listens for exit)
 * 2. Has the startup pattern been matched in stdout/stderr?
 *
 * Returns `true` when the bot is ready (pattern matched),
 * `false` if the process exits or the timeout elapses before the pattern is seen.
 *
 * @default startupPattern - matches started, ready, listening, or initialized (case-insensitive)
 * @default timeoutMs - 10000ms
 */
export function isBotReady(options: IsBotReadyOptions): Promise<boolean> {
	const {
		process: proc,
		timeoutMs = 10000,
		startupPattern = /started|ready|listening|initialized/i,
	} = options;

	return new Promise<boolean>((resolve) => {
		let resolved = false;

		const done = (result: boolean): void => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timeout);
			cleanup();
			resolve(result);
		};

		const cleanup = (): void => {
			proc.stdout?.removeListener("data", onStdout);
			proc.stderr?.removeListener("data", onStderr);
			proc.removeListener("exit", onExit);
		};

		const timeout = setTimeout(() => done(false), timeoutMs);

		const onStdout = (data: string | Buffer): void => {
			if (startupPattern.test(data.toString())) {
				done(true);
			}
		};

		const onStderr = (data: string | Buffer): void => {
			if (startupPattern.test(data.toString())) {
				done(true);
			}
		};

		const onExit = (): void => {
			done(false);
		};

		proc.stdout?.on("data", onStdout);
		proc.stderr?.on("data", onStderr);
		proc.on("exit", onExit);
	});
}
