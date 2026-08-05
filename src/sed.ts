import { Logger } from "./logger";
import type { SedCommand, TaskMessage } from "./types";
import type { WorkerPool } from "./workerPool";
import { SED_PATTERN, getRegexFlags, escapeMarkdownV2 } from "./utils";
import { CONFIG } from "./config";
import { RegexError, WorkerError } from "./errors";
import type { MyContext } from "./i18n";
import { recordSubstitution } from "./metrics";
import {
	detectDangerousPattern,
	formatDangerousPatternWarning,
	isSimplePattern,
} from "./dangerousPatterns";
import { getBestTip, sendTransientTip } from "./optimizationTips";

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

// ---

type RoastFn = (pattern: string, flags: string) => string;

const ROASTS: RoastFn[] = [
	(p) =>
		`you wrote a whole regex to match \`${p}\`? that's like using a nuke to open a beer.`,
	(p) => `\`${p}\` — ah yes, the "I just learned what regex is" starter pack.`,
	(p, f) =>
		f.includes("g")
			? `bro used the global flag on \`${p}\` like it's going to war`
			: `\`${p}\`? my cat could walk across the keyboard and do better.`,
	(p) =>
		p.length > 30
			? `that pattern has more characters than my will to live: \`${p.slice(0, 40)}...\``
			: "",
	(p) =>
		p.includes("(?=") || p.includes("(?<")
			? `lookahead? more like look-at-me-I-know-fancy-regex.`
			: "",
	(p) =>
		p.includes("@") || p.includes("\\w+")
			? `another email validator? groundbreaking. truly revolutionary.`
			: "",
	(p, f) =>
		f.includes("g") && p.includes("+")
			? `greedy AND global? someone's got main character energy.`
			: "",
	(_, f) =>
		f === ""
			? `deleting things? very therapeutic. I recommend a journal though.`
			: "",
	(p) =>
		(p.match(/\\/g) || []).length > 5
			? `that pattern has more backslashes than a Windows file path.`
			: "",
	(p) =>
		p.startsWith("^") && p.endsWith("$")
			? `start-to-end anchoring? someone's a perfectionist.`
			: "",
	(p) =>
		p.includes("[") && p.includes("]")
			? `imagine writing a character class when you could just... not.`
			: "",
	(p) =>
		(p.match(/\./g) || []).length > 3
			? `so many dots. are you decorating a christmas tree?`
			: "",
	() => `I've seen production code with fewer issues than that regex.`,
	() => `somewhere, a senior developer just felt a disturbance in the force.`,
	() => `and people say regex isn't a cry for help.`,
	() =>
		`I'm not saying it's bad, but the regex hall of shame just sent an invitation.`,
	() => `that regex works on my machine. and by "works" I mean "compiles".`,
	() => `if regex were an Olympic sport, that'd be a disqualification.`,
	() => `the absolute audacity to type that out and hit enter.`,
];

const THEMED_ROASTS: Record<string, RoastFn[]> = {
	aprilFools: [
		(p) =>
			`\`${p}\` — I'm legally required to inform you that today is April Fools' and your regex is the joke.`,
		() => `happy April Fools'! your regex was the prank all along. 🤡`,
		(p) =>
			`🎉 Congratulations! You've been selected as today's April Fools' regex of the day: \`${p}\``,
		() => `april fools! just kidding, that regex is actually terrible.`,
		() =>
			`I was going to roast your regex, but then I remembered it's April Fools' — the regex IS the roast.`,
		(p) => `🔮 I consulted the stars and they said: \`${p}\` is... a choice.`,
		() =>
			`breaking news: local developer writes regex, thinks it works. more at 11.`,
		() => `your regex just set off every alarm in the regex police station. 🚨`,
		() => `I showed your regex to my rubber duck and it quit.`,
		() =>
			`if your regex were a person, it'd be on a watchlist. happy April Fools'!`,
		(p) =>
			`somewhere, a regex validator just filed a restraining order against \`${p}\`.`,
		() =>
			`🔮 Fun fact: April Fools' traditions date back to 1582. Your regex dates back to never being correct.`,
		() =>
			`I'd explain what's wrong with your regex, but I don't have a PhD in hieroglyphics.`,
		() =>
			`your regex is so bad, it made the bot send this message. you did this.`,
	],
	friday13th: [
		(p) =>
			`Friday the 13th and your regex is the horror story. \`${p}\` — I'm scared.`,
		(p) =>
			`👻 the ghost of good regex practices haunts this chat. your pattern: \`${p}\`.`,
		() =>
			`🔪 Jason Voorhees just saw your regex and put down his knife. even he has standards.`,
		() =>
			`🎃 it's Friday the 13th! your regex is scarier than any slasher film.`,
		(p) =>
			`🕯️ on this cursed day, your regex \`${p}\` rises from the dead to haunt us all.`,
		() => `🦇 Friday the 13th special: your regex just unlocked a new fear.`,
		(p) =>
			`💀 RIP regex best practices. died Friday the 13th, killed by \`${p}\`.`,
		() => `⚰️ I've seen haunted houses with better structure than that regex.`,
		() =>
			`🕸️ your regex is so spooky, even the cobwebs are afraid to touch it.`,
		() =>
			`Friday the 13th fun fact: the odds of your regex being correct are approximately 13 in 100.`,
		() =>
			`🪦 here lies a good regex. it was murdered by whoever wrote the last one.`,
		() => `🕯️ the candles are flickering. your regex is here. nobody is safe.`,
	],
};

function getSpecialDay(): RoastFn[] | null {
	const now = new Date();
	const month = now.getMonth();
	const date = now.getDate();
	const day = now.getDay();

	if (month === 3 && date === 1) return THEMED_ROASTS.aprilFools;
	if (day === 5 && date === 13) return THEMED_ROASTS.friday13th;
	return null;
}

function pickRoast(
	candidates: RoastFn[],
	pattern: string,
	flags: string,
): string {
	const applicable = candidates.filter((fn) => {
		try {
			return fn(pattern, flags) !== "";
		} catch {
			return false;
		}
	});
	const pool = applicable.length > 0 ? applicable : candidates;
	const fn = pool[Math.floor(Math.random() * pool.length)];
	return fn(pattern, flags) || pool[0](pattern, flags);
}

function maybeRoast(pattern: string, flags: string): string | null {
	if (!CONFIG.FEATURE_ROAST) return null;

	const themed = getSpecialDay();
	if (themed) return pickRoast([...ROASTS, ...themed], pattern, flags);

	if (Math.random() > CONFIG.ROAST_CHANCE) return null;
	return pickRoast(ROASTS, pattern, flags);
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
		linkPreviewDisabled?: boolean,
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
		linkPreviewDisabled?: boolean,
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
		let lastPattern = "";
		let lastFlags = "";

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
			lastPattern = fr;
			lastFlags = commandForWorker.flags;

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
					if (CONFIG.FEATURE_WARNINGS) {
						await ctx.reply(escapeMarkdownV2(warning), {
							parse_mode: "MarkdownV2",
							receiver_user_id: ctx.from?.id,
						});
					}
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
		let resultText = currentText.slice(0, MAX_MESSAGE_LENGTH).trimEnd();
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
			escapeMarkdownV2(resultText),
			isEdit,
			linkPreviewDisabled,
		);

		const roast = maybeRoast(lastPattern, lastFlags);
		if (roast && ctx.chat) {
			await ctx.api.sendMessage(ctx.chat.id, roast);
		}

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

		// Show optimization tip if applicable (max one per chain)
		if (CONFIG.FEATURE_TIPS) {
			if (ctx.from?.id) {
				const userId = ctx.from.id;
				for (const commandString of sedCommands.slice(0, MAX_CHAIN_LENGTH)) {
					const match = commandString.match(SED_PATTERN);
					if (!match) continue;

					const pattern = match[1].replace(/\\\//g, "/");
					const tip = getBestTip(pattern, userId, match[2]);

					if (tip) {
						await sendTransientTip(ctx, tip);
						break; // Only show one tip per chain
					}
				}
			}
		}
	}
}
