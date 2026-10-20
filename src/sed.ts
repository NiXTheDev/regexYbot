import { Logger } from "./logger";
import type { SedCommand, TaskMessage } from "./types";
import type { WorkerPool } from "./workerPool";
import { SED_PATTERN, getRegexFlags, escapeMarkdownV2 } from "./utils";
import { CONFIG } from "./config";
import {
	BotError,
	RegexError,
	WorkerError,
	isWorkerError,
	isCircuitBreakerError,
} from "./errors";
import type { MyContext } from "./i18n";
import { recordSubstitution } from "./metrics";
import {
	detectDangerousPattern,
	formatDangerousPatternWarning,
	isSimplePattern,
} from "./dangerousPatterns";
import { getBestTip, sendTransientTip } from "./optimizationTips";

const { MAX_CHAIN_LENGTH, MAX_MESSAGE_LENGTH } = CONFIG;

/**
 * Track performance message info for edit handling
 *
 * One entry per (chat, target) pair: whenever a run produces a fresh
 * separate performance message for a target, the entry of the previous
 * run is deleted along with its message, so repeated commands and edits
 * never accumulate stale timing readouts.
 */
interface PerformanceMessageInfo {
	chatId: number;
	targetMessageId: number;
	performanceMessageId: number;
	timestamp: number;
}

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

	if (month === 3 && date === 1) return THEMED_ROASTS["aprilFools"] ?? null;
	if (day === 5 && date === 13) return THEMED_ROASTS["friday13th"] ?? null;
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
	const fallback = pool[0];
	return fn?.(pattern, flags) || fallback?.(pattern, flags) || "";
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
		sedCommand: string,
		isEdit: boolean,
		linkPreviewDisabled?: boolean,
	) => Promise<void>;
}

export class SedHandler {
	private logger: Logger;

	/**
	 * In-memory tracking of the live separate performance message per
	 * (chat, target) pair — no persistence. Owned by the handler instance:
	 * production constructs exactly one handler, while fresh instances
	 * (tests included) never share cleanup state.
	 */
	private readonly performanceMessageTracker = new Map<
		string,
		PerformanceMessageInfo
	>();

	constructor(private deps: SedHandlerDependencies) {
		this.logger = new Logger("SedHandler");

		// Prune tracking entries older than 48 hours (Telegram's edit
		// window) once an hour.
		setInterval(
			() => {
				const cutoff = Date.now() - 48 * 60 * 60 * 1000;
				for (const [key, info] of this.performanceMessageTracker) {
					if (info.timestamp < cutoff) {
						this.performanceMessageTracker.delete(key);
					}
				}
			},
			60 * 60 * 1000,
		);
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

			const fr = (match[1] ?? "").replace(/\\\//g, "/");
			const processedTo = (match[2] ?? "")
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
						const isGroupChat =
							ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
						try {
							await ctx.sendMessage(escapeMarkdownV2(warning), {
								parse_mode: "MarkdownV2",
								receiver_user_id: isGroupChat ? ctx.from?.id : undefined,
							});
						} catch (error: unknown) {
							this.logger.error(
								String(error),
								"Failed to send dangerous pattern warning",
							);
						}
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
					await ctx.sendMessage(`Error during substitution: ${result.error}`);
					return;
				}
				currentText = result.result;
				substitutionCount++;
				this.logger.debug(
					`Command result. New text length: ${currentText.length}`,
				);
			} catch (error: unknown) {
				this.logger.error(String(error), "Worker pool task failed");

				// The pool already rejects with typed errors (timeouts, worker
				// crashes, shutdown); only failures that arrive untyped need
				// conversion here.
				let botError: BotError;
				if (
					isWorkerError(error) &&
					error.message.includes("Invalid regular expression")
				) {
					// Engine SyntaxErrors surface as plain WorkerErrors from the
					// pool; convert for the pattern-specific user guidance.
					botError = new RegexError(
						commandForWorker.pattern,
						commandForWorker.flags,
						error,
					);
				} else if (error instanceof BotError) {
					botError = error;
				} else {
					botError = new WorkerError(
						error instanceof Error ? error.message : String(error),
						"regex_execution",
					);
				}

				await ctx.sendMessage(botError.getUserMessage());
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

		// Persist the sed command so `/diff` can reconstruct it later.
		// `join("\n")` round-trips through `parseSedCommands`: a command only
		// starts on a line beginning with `s/`, and continuation lines can never
		// begin with `s/` (they would have started a new command instead).
		try {
			await this.deps.sendOrEditReply(
				ctx,
				targetMsgId,
				escapeMarkdownV2(resultText),
				sedCommands.join("\n"),
				isEdit,
				linkPreviewDisabled,
			);
		} catch (error: unknown) {
			if (!isCircuitBreakerError(error)) {
				throw error;
			}
			// The Telegram send path is circuit-broken after repeated API
			// failures; tell the user instead of piling on more requests.
			this.logger.warn(
				`Telegram send circuit open, dropping sed reply to message ${targetMsgId}`,
			);
			await ctx.sendMessage(ctx.t("error-circuitOpen"));
			return;
		}

		const roast = maybeRoast(lastPattern, lastFlags);
		if (roast && ctx.chat) {
			await ctx.api.sendMessage(ctx.chat.id, roast);
		}

		// A previous run against the same target may have left a separate
		// performance message behind. Remove it (and its tracking entry) so
		// repeated commands and edits never accumulate stale timing readouts,
		// including edits that stop using the performance flag entirely.
		const trackedChatId = ctx.chat?.id;
		if (trackedChatId !== undefined) {
			const key = `${trackedChatId}:${targetMsgId}`;
			const stale = this.performanceMessageTracker.get(key);
			if (stale) {
				this.performanceMessageTracker.delete(key);
				ctx.api
					.deleteMessage(stale.chatId, stale.performanceMessageId)
					.catch(() =>
						this.logger.debug("Failed to delete stale performance message"),
					);
			}
		}

		// Send separate performance message if needed
		if (performanceText) {
			const sentPerfMsg = await ctx.sendMessage(performanceText);
			// Store tracking info so a later run against the same target can
			// remove this message before producing its own.
			const chatId = ctx.chat?.id;
			if (chatId) {
				const key = `${chatId}:${targetMsgId}`;
				this.performanceMessageTracker.set(key, {
					chatId,
					targetMessageId: targetMsgId,
					performanceMessageId: sentPerfMsg.message_id,
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

					const pattern = (match[1] ?? "").replace(/\\\//g, "/");
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
