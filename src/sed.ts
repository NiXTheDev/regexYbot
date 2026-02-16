import { Logger } from "./logger";
import type { SedCommand, TaskMessage } from "./types";
import type { WorkerPool } from "./workerPool";
import {
	SED_PATTERN,
	getRegexFlags,
	escapeForMarkdownV2AndBackslashes,
} from "./utils";
import { CONFIG } from "./config";
import { RegexError, WorkerError } from "./errors";
import type { MyContext } from "./i18n";
import { recordSubstitution } from "./metrics";
import {
	detectDangerousPattern,
	formatDangerousPatternWarning,
	isSimplePattern,
} from "./dangerousPatterns";

const { MAX_CHAIN_LENGTH, MAX_MESSAGE_LENGTH, WORKER_TIMEOUT_MS } = CONFIG;

/**
 * Track performance message info for edit handling
 */
interface PerformanceMessageInfo {
	chatId: number;
	targetMessageId: number;
	resultMessageId: number;
	performanceMessageId?: number;
	isInlined: boolean;
	timestamp: number;
}

// In-memory storage for performance message tracking (no persistence)
const performanceMessageTracker = new Map<string, PerformanceMessageInfo>();

// Cleanup old entries after 48 hours (matching Telegram edit window)
setInterval(
	() => {
		const cutoff = Date.now() - 48 * 60 * 60 * 1000;
		for (const [key, info] of performanceMessageTracker) {
			if (info.timestamp < cutoff) {
				performanceMessageTracker.delete(key);
			}
		}
	},
	60 * 60 * 1000,
); // Run cleanup every hour

/**
 * Format duration in human-readable units
 */
function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	if (ms < 3600000) {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.round((ms % 60000) / 1000);
		return `${minutes}m ${seconds}s`;
	}
	const hours = Math.floor(ms / 3600000);
	const minutes = Math.floor((ms % 3600000) / 60000);
	return `${hours}h ${minutes}m`;
}

export function parseSedCommands(text: string): string[] {
	const lines = text.split("\n");
	const commands: string[] = [];
	let currentCommand = "";

	for (const line of lines) {
		if (line.trim().startsWith("s/")) {
			if (currentCommand) {
				commands.push(currentCommand.trim());
			}
			currentCommand = line;
		} else if (currentCommand) {
			currentCommand += "\n" + line;
		}
	}

	if (currentCommand) {
		commands.push(currentCommand.trim());
	}

	return commands;
}

export interface SedHandlerDependencies {
	workerPool: WorkerPool;
	sendOrEditReply: (
		ctx: MyContext,
		targetMsgId: number,
		messageText: string,
		isEdit: boolean,
	) => Promise<void>;
}

export class SedHandler {
	private logger: Logger;

	constructor(private deps: SedHandlerDependencies) {
		this.logger = new Logger("SedHandler");
	}

	async handleSedCommand(
		ctx: MyContext,
		sedCommands: string[],
		targetMsgText: string,
		targetMsgId: number,
		isEdit: boolean,
	): Promise<void> {
		this.logger.debug(
			`Handling ${sedCommands.length} sed command(s) for targetMsgId: ${targetMsgId}`,
		);
		this.logger.debug(`Commands to execute: ${JSON.stringify(sedCommands)}`);

		const hasPerformanceFlag = sedCommands.some((cmd) => {
			const match = cmd.match(SED_PATTERN);
			return match
				? getRegexFlags(match[3]).originalFlags?.toLowerCase().includes("p")
				: false;
		});

		const startTime = hasPerformanceFlag ? performance.now() : undefined;
		let currentText = targetMsgText;
		let substitutionCount = 0;

		for (const commandString of sedCommands.slice(0, MAX_CHAIN_LENGTH)) {
			const match = commandString.match(SED_PATTERN);
			if (!match) continue;

			const fr = match[1].replace(/\\\//g, "/");
			const processedTo = match[2]
				.replace(/\\\//g, "/")
				.replace(/\\(\d+)/g, "$$$1")
				.replace(/\\n/g, "\n")
				.replace(/\\t/g, "\t");
			const { flags } = getRegexFlags(match[3]);
			const commandForWorker: SedCommand = {
				pattern: fr,
				flags,
				replacement: processedTo,
			};

			this.logger.debug(
				`Executing command: pattern="${commandForWorker.pattern}", flags="${commandForWorker.flags}", replacement="${commandForWorker.replacement}"`,
			);

			// Check for dangerous patterns (warn but don't block)
			if (!isSimplePattern(commandForWorker.pattern)) {
				const dangerCheck = detectDangerousPattern(commandForWorker.pattern);
				if (dangerCheck.detected) {
					this.logger.warn(
						`Dangerous pattern detected: ${commandForWorker.pattern} (score: ${dangerCheck.complexityScore})`,
					);
					// Show warning but continue execution
					const warning = formatDangerousPatternWarning(dangerCheck);
					await ctx.reply(warning, { parse_mode: "Markdown" });
				}
			}

			try {
				const task: TaskMessage = {
					initialText: currentText,
					commands: [commandForWorker],
					includePerformance: hasPerformanceFlag,
				};
				const result = await this.deps.workerPool.run(task);
				if (result.error) {
					await ctx.reply(`Error during substitution: ${result.error}`);
					return;
				}
				currentText = result.result;
				substitutionCount++;
				this.logger.debug(
					`Command result. New text length: ${currentText.length}`,
				);
			} catch (error: unknown) {
				this.logger.error(String(error), "Worker pool task failed");

				// Convert to custom error types for consistent handling
				let botError: WorkerError | RegexError;
				if (error instanceof Error && error.message.includes("timed out")) {
					botError = new WorkerError(
						`Regex operation timed out after ${WORKER_TIMEOUT_MS / 1000}s`,
						"regex_execution",
						undefined,
						{ timeout: WORKER_TIMEOUT_MS },
					);
				} else if (
					error instanceof Error &&
					error.message.includes("Invalid regular expression")
				) {
					botError = new RegexError(
						commandForWorker.pattern,
						commandForWorker.flags,
						error instanceof Error ? error : undefined,
					);
				} else {
					botError = new WorkerError(
						error instanceof Error ? error.message : String(error),
						"regex_execution",
					);
				}

				await ctx.reply(botError.getUserMessage());
				return;
			}
		}

		let totalPerformanceMs: number | null = null;
		if (hasPerformanceFlag && startTime !== undefined) {
			totalPerformanceMs = performance.now() - startTime;
		}

		// Record successful substitution
		recordSubstitution();

		// Prepare the result message
		let resultText = currentText.slice(0, MAX_MESSAGE_LENGTH);
		let performanceText: string | null = null;

		if (hasPerformanceFlag && totalPerformanceMs !== null) {
			const formattedTime = formatDuration(totalPerformanceMs);
			performanceText = `Performed ${substitutionCount} substitution${substitutionCount !== 1 ? "s" : ""} in ${formattedTime}`;

			// Calculate if performance text fits inline
			// Need: result + "\n\n" + performanceText <= MAX_MESSAGE_LENGTH
			const separatorLength = 2; // "\n\n"
			const totalLength =
				resultText.length + separatorLength + performanceText.length;

			if (totalLength <= MAX_MESSAGE_LENGTH) {
				// Fits inline - add to result
				resultText += "\n\n" + performanceText;
				performanceText = null; // Don't send separately
			}
			// If doesn't fit, performanceText remains non-null for separate message
		}

		await this.deps.sendOrEditReply(
			ctx,
			targetMsgId,
			escapeForMarkdownV2AndBackslashes(resultText),
			isEdit,
		);

		// Send separate performance message if needed
		if (performanceText) {
			const sentPerfMsg = await ctx.reply(performanceText);
			// Store tracking info for edit handling
			const chatId = ctx.chat?.id;
			if (chatId) {
				const key = `${chatId}:${targetMsgId}`;
				// We need the result message ID - get it from the bot_replies tracking
				// This will be updated when sendOrEditReply stores it
				performanceMessageTracker.set(key, {
					chatId,
					targetMessageId: targetMsgId,
					resultMessageId: 0, // Will be updated
					performanceMessageId: sentPerfMsg.message_id,
					isInlined: false,
					timestamp: Date.now(),
				});
			}
		}
	}
}
