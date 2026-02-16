import { CommandGroup, commands } from "@grammyjs/commands";
import { run } from "@grammyjs/runner";
import { SQL } from "bun";
import { writeFileSync } from "node:fs";
import { Bot, GrammyError, session } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { CONFIG } from "./config";
import { Logger, withCorrelation } from "./logger";
import { SED_PATTERN } from "./utils";
import { DatabaseService } from "./database";
import { WorkerPool } from "./workerPool";
import { parseSedCommands, SedHandler } from "./sed";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TelegramAPIError } from "./errors";
import {
	createCategoryKeyboard,
	createItemKeyboard,
	formatItemHelp,
	formatCategoryHelp,
	getMainHelpMessage,
} from "./regexhelp";
import {
	i18n,
	MyContext,
	getLanguageInfo,
	formatLanguageList,
	isSupportedLanguage,
} from "./i18n";

// --- Configuration ---
const {
	TOKEN,
	BASE_URL,
	WORKER_TIMEOUT_MS,
	WORKER_POOL_MIN_WORKERS,
	WORKER_POOL_MAX_WORKERS,
	WORKER_POOL_INITIAL_WORKERS,
	WORKER_POOL_IDLE_TIMEOUT_MS,
	WORKER_POOL_IDLE_CHECK_INTERVAL_MS,
	RETRY_MAX_RETRIES,
	RETRY_MAX_DELAY_MS,
	ENABLE_FILE_HEALTHCHECK,
	LIVENESS_FILE,
	LIVENESS_INTERVAL_MS,
	RATE_LIMIT_ENABLED,
	RATE_LIMIT_COMMANDS_PER_MINUTE,
} = CONFIG;

// --- Bot Initialization ---
const logger = new Logger("Main");
logger.info("Initializing bot...");
const bot = new Bot<MyContext>(TOKEN, { client: { apiRoot: BASE_URL } });

// --- Rate Limiting & Retry Configuration ---
bot.api.config.use(
	autoRetry({
		maxRetryAttempts: RETRY_MAX_RETRIES,
		maxDelaySeconds: RETRY_MAX_DELAY_MS / 1000,
	}),
);

bot.use(commands());

// --- Session & i18n Setup ---
bot.use(
	session({
		initial: () => ({}),
	}),
);
bot.use(i18n);

// --- Rate Limiting ---
if (RATE_LIMIT_ENABLED) {
	logger.info(
		`Rate limiting enabled: ${RATE_LIMIT_COMMANDS_PER_MINUTE} commands/minute`,
	);

	// Store rate limit data per user
	const userCommandCounts = new Map<
		number,
		{ count: number; resetTime: number }
	>();

	// Store edit history per user for abuse detection
	interface EditRecord {
		timestamp: number;
		charChangeCount: number;
		hadError: boolean;
	}
	const userEditHistory = new Map<number, EditRecord[]>();

	// Clean old edit records periodically (every 5 minutes)
	setInterval(() => {
		const now = Date.now();
		for (const [userId, edits] of userEditHistory) {
			const recentEdits = edits.filter((e) => now - e.timestamp < 60000);
			if (recentEdits.length === 0) {
				userEditHistory.delete(userId);
			} else {
				userEditHistory.set(userId, recentEdits);
			}
		}
	}, 300000);

	bot.use(async (ctx, next) => {
		const userId = ctx.from?.id;
		if (!userId) {
			return next();
		}

		// Parse text for sed commands
		const text =
			ctx.message?.text ||
			ctx.message?.caption ||
			ctx.editedMessage?.text ||
			ctx.editedMessage?.caption;
		if (!text) {
			return next();
		}

		// Count sed commands in message
		const commands = parseSedCommands(text);
		if (commands.length === 0) {
			// Not a sed command, don't rate limit
			return next();
		}

		const isEdit = !!ctx.editedMessage;
		const now = Date.now();

		// Get or initialize user data
		let userData = userCommandCounts.get(userId);
		if (!userData || now > userData.resetTime) {
			userData = { count: 0, resetTime: now + 60000 };
			userCommandCounts.set(userId, userData);
		}

		// Calculate rate limit cost
		let cost: number;

		if (!isEdit) {
			// Regular message: full cost per command
			cost = commands.length;
		} else {
			// Edit: calculate with enhanced logic
			const editHistory = userEditHistory.get(userId) || [];

			// Calculate character change count (approximate)
			// For edits, we don't have the original, so we use a heuristic
			// Small edits are < 10 characters changed
			const charChangeCount = text.length; // Simplified - assume all text is "changed"
			const isSmallChange = charChangeCount < 10;

			// Count small edits in last minute for abuse detection
			const recentSmallEdits = editHistory.filter(
				(e) => e.timestamp > now - 60000 && e.charChangeCount < 10,
			);
			const isAbusingSmallEdits = recentSmallEdits.length >= 5;

			// Get last edit to check for error penalty
			const lastEdit =
				editHistory.length > 0 ? editHistory[editHistory.length - 1] : null;
			const previousHadError = lastEdit?.hadError ?? false;

			// Calculate cost
			if (isAbusingSmallEdits) {
				// Abuse detected: apply retroactive full penalties
				cost = commands.length; // Full cost instead of 0.5
				logger.debug(
					`Rate limit abuse detected for user ${userId}: ${recentSmallEdits.length} small edits`,
				);
			} else if (isSmallChange) {
				// Small change: minimal cost (0.25 per command)
				cost = commands.length * 0.25;
			} else {
				// Normal edit: half cost (0.5 per command)
				cost = commands.length * 0.5;
			}

			// Add error penalty if previous edit had error
			if (previousHadError) {
				cost += 0.5;
				logger.debug(`Rate limit error penalty applied for user ${userId}`);
			}

			// Record this edit
			const editRecord: EditRecord = {
				timestamp: now,
				charChangeCount,
				hadError: false, // Will be updated after processing
			};
			editHistory.push(editRecord);
			userEditHistory.set(userId, editHistory);

			// Store record index for later error update
			(ctx as typeof ctx & { __editRecordIndex?: number }).__editRecordIndex =
				editHistory.length - 1;
		}

		// Check if this would exceed limit
		if (userData.count + cost > RATE_LIMIT_COMMANDS_PER_MINUTE) {
			const remaining = Math.ceil((userData.resetTime - now) / 1000);
			logger.debug(`User ${userId} rate limited. Retry after ${remaining}s`);
			await ctx.reply(ctx.t("errors.rateLimit", { seconds: remaining }));
			return; // Don't process the command
		}

		// Process the command
		let hadError = false;
		try {
			const result = await next();
			return result;
		} catch (error) {
			hadError = true;
			throw error;
		} finally {
			// Update edit record with error status
			if (isEdit) {
				const editHistory = userEditHistory.get(userId);
				const recordIndex = (ctx as typeof ctx & { __editRecordIndex?: number })
					.__editRecordIndex;
				if (
					editHistory &&
					recordIndex !== undefined &&
					editHistory[recordIndex]
				) {
					editHistory[recordIndex].hadError = hadError;
				}
			}

			// Only count successful commands (unless it was an edit abuse case)
			if (!hadError || (isEdit && cost >= commands.length)) {
				userData.count += cost;
			}
		}
	});
}

// --- Database Setup ---
logger.info("Initializing in-memory database...");
const db = new SQL("sqlite://:memory:");

logger.info("Creating database tables...");
try {
	await db`
    CREATE TABLE IF NOT EXISTS message_history (
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chat_id, message_id)
    )
  `;
	await db`
    CREATE TABLE IF NOT EXISTS bot_replies (
      target_message_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      bot_message_id INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (target_message_id, chat_id)
    )
  `;
	await db`CREATE INDEX IF NOT EXISTS idx_bot_replies_timestamp ON bot_replies(timestamp)`;
	await db`CREATE INDEX IF NOT EXISTS idx_message_history_timestamp ON message_history(timestamp)`;
	// Additional indexes for performance
	await db`CREATE INDEX IF NOT EXISTS idx_message_history_chat_id ON message_history(chat_id)`;
	await db`CREATE INDEX IF NOT EXISTS idx_bot_replies_chat_id ON bot_replies(chat_id)`;
	await db`CREATE INDEX IF NOT EXISTS idx_bot_replies_target ON bot_replies(target_message_id)`;
	logger.info("Database setup complete.");
} catch (error) {
	logger.fatal(`${error}\nDatabase setup failed. Exiting.`);
	process.exit(1);
}

const dbService = new DatabaseService(db);

// --- Worker Pool Setup ---
const __filename = fileURLToPath(import.meta.url);
const workerScriptPath = join(__filename, "..", "hellspawn.ts");

// Initialize WorkerPool with dynamic scaling
const workerPool = new WorkerPool({
	maxWorkers: WORKER_POOL_MAX_WORKERS,
	minWorkers: WORKER_POOL_MIN_WORKERS,
	initialWorkers: WORKER_POOL_INITIAL_WORKERS,
	taskTimeoutMs: WORKER_TIMEOUT_MS,
	idleTimeoutMs: WORKER_POOL_IDLE_TIMEOUT_MS,
	idleCheckIntervalMs: WORKER_POOL_IDLE_CHECK_INTERVAL_MS,
	workerScript: workerScriptPath,
});

logger.info("Using WorkerPool with dynamic scaling");

// --- Sed Handler Setup ---
async function sendOrEditReply(
	ctx: MyContext,
	targetMsgId: number,
	messageText: string,
	isEdit: boolean = false,
): Promise<void> {
	logger.debug(`Attempting to ${isEdit ? "edit" : "send"} a reply.`);
	try {
		if (isEdit) {
			const previousBotReplyId = await dbService.getBotReplyMessageId(
				targetMsgId,
				ctx.chat!.id,
			);
			if (previousBotReplyId) {
				try {
					await ctx.api.editMessageText(
						ctx.chat!.id,
						previousBotReplyId,
						messageText,
						{ parse_mode: "MarkdownV2" },
					);
					await dbService.storeBotReplyMapping(
						targetMsgId,
						ctx.chat!.id,
						previousBotReplyId,
					);
					await dbService.storeBotReplyInHistory(
						ctx.chat!.id,
						previousBotReplyId,
						messageText,
					);
					logger.debug("Successfully edited reply.");
					return;
				} catch (e) {
					if (
						e instanceof GrammyError &&
						e.description.includes("message is not modified")
					) {
						logger.debug("Edit failed: message not modified, ignoring.");
						return;
					}
					logger.error(`${e}\nError editing bot reply, sending new one`);
				}
			}
		}
		const sentMsg = await ctx.api.sendMessage(ctx.chat!.id, messageText, {
			reply_parameters: { message_id: targetMsgId },
			parse_mode: "MarkdownV2",
		});
		await dbService.storeBotReplyMapping(
			targetMsgId,
			ctx.chat!.id,
			sentMsg.message_id,
		);
		await dbService.storeBotReplyInHistory(
			ctx.chat!.id,
			sentMsg.message_id,
			messageText,
		);
		logger.debug("Successfully sent new reply.");
	} catch (error) {
		// Convert to TelegramAPIError for consistent handling
		const telegramError =
			error instanceof GrammyError
				? new TelegramAPIError(
						error.description,
						"sendMessage",
						error.error_code,
						error.error_code === 429 || error.error_code >= 500,
					)
				: new TelegramAPIError(String(error), "sendMessage", undefined, false);

		logger.error(`${telegramError.message} (code: ${telegramError.code})`);

		// Only show user message for non-retryable errors
		if (!telegramError.retryable) {
			try {
				await ctx.reply(telegramError.getUserMessage());
			} catch {
				// Ignore reply errors
			}
		}
	}
}

const sedHandler = new SedHandler({ workerPool, sendOrEditReply });

// --- Bot Logic ---
async function handleTextMessage(
	ctx: MyContext,
	messageText: string | undefined,
	messageId: number,
	isEdit: boolean,
): Promise<void> {
	if (!ctx.message && !ctx.editedMessage) return;

	const text = messageText;
	if (text && !text.startsWith("/") && ctx.chat) {
		await dbService.storeMessageInHistory(ctx.chat.id, messageId, text);
	}

	if (text?.includes("s/")) {
		const sedCommands = parseSedCommands(text);
		logger.debug(`Found ${sedCommands.length} sed command(s).`);
		if (sedCommands.length === 0) return;
		const firstMatch = sedCommands[0].match(SED_PATTERN);
		if (!firstMatch) return;
		const { targetMsgText, targetMsgId } = await dbService.findTargetMessage(
			ctx,
			firstMatch,
			isEdit ? messageId : undefined,
		);
		if (targetMsgText && targetMsgId && !SED_PATTERN.test(targetMsgText)) {
			logger.debug(
				`Found valid target. Proceeding with handleSedCommand (isEdit: ${isEdit}).`,
			);
			await sedHandler.handleSedCommand(
				ctx,
				sedCommands,
				targetMsgText,
				targetMsgId,
				isEdit,
			);
		} else if (!targetMsgText || !targetMsgId) {
			logger.info("No target found for sed command.");
			if (!isEdit) {
				await ctx
					.reply("Could not find a matching message to substitute.")
					.catch((err) => logger.error(err));
			}
		} else {
			logger.debug("Target message is a sed command, ignoring.");
		}
	}
}

// --- Command Group ---
const myCommands = new CommandGroup<MyContext>();
myCommands.command("privacy", "Show privacy information", async (ctx) => {
	await ctx.reply(ctx.t("commands.privacy"));
});
myCommands.command("start", "Get a greeting message", async (ctx) => {
	await ctx.reply(ctx.t("commands.start"), { parse_mode: "Markdown" });
});

myCommands.command("regexhelp", "Get help with regex syntax", async (ctx) => {
	await ctx.reply(getMainHelpMessage(), {
		parse_mode: "Markdown",
		reply_markup: createCategoryKeyboard(),
	});
});

myCommands.command("language", "Change bot language", async (ctx) => {
	const args = ctx.match.trim().split(/\s+/);
	const subcommand = args[0]?.toLowerCase();

	if (!subcommand || subcommand === "") {
		// Show current language
		const currentLang = await ctx.i18n.getLocale();
		const langInfo = getLanguageInfo(currentLang);
		await ctx.reply(
			ctx.t("command-language-current", {
				language: langInfo?.nativeName || currentLang,
			}),
		);
		return;
	}

	if (subcommand === "list") {
		// Show available languages
		await ctx.reply(
			ctx.t("command-language-list", {
				languages: formatLanguageList(),
			}),
		);
		return;
	}

	if (subcommand === "set" && args[1]) {
		const langCode = args[1].toLowerCase();
		if (!isSupportedLanguage(langCode)) {
			await ctx.reply(ctx.t("command-language-setError"));
			return;
		}

		const currentLang = await ctx.i18n.getLocale();
		if (currentLang === langCode) {
			const langInfo = getLanguageInfo(langCode);
			await ctx.reply(
				ctx.t("command-language-current", {
					language: langInfo?.nativeName || langCode,
				}),
			);
			return;
		}

		await ctx.i18n.setLocale(langCode);
		const langInfo = getLanguageInfo(langCode);
		await ctx.reply(
			ctx.t("command-language-setSuccess", {
				language: langInfo?.nativeName || langCode,
			}),
		);
		return;
	}

	// Invalid usage
	await ctx.reply(ctx.t("command-language-usage"));
});

bot.use(myCommands);

// --- Callback Query Handler for Regex Help ---
bot.on("callback_query:data", async (ctx) => {
	const data = ctx.callbackQuery.data;

	if (data.startsWith("regexhelp:")) {
		const parts = data.split(":");
		const action = parts[1];

		if (action === "back") {
			// Show main help menu
			await ctx.editMessageText(getMainHelpMessage(), {
				parse_mode: "Markdown",
				reply_markup: createCategoryKeyboard(),
			});
		} else if (action === "category" && parts[2]) {
			// Show category items
			const categoryKey = parts[2];
			const helpText = formatCategoryHelp(categoryKey);
			if (helpText) {
				await ctx.editMessageText(helpText, {
					parse_mode: "Markdown",
					reply_markup: createItemKeyboard(categoryKey),
				});
			}
		} else if (action === "item" && parts[2] && parts[3]) {
			// Show item details
			const categoryKey = parts[2];
			const itemKey = parts[3];
			const helpText = formatItemHelp(categoryKey, itemKey);
			if (helpText) {
				await ctx.editMessageText(helpText, {
					parse_mode: "Markdown",
					reply_markup: createItemKeyboard(categoryKey),
				});
			}
		}

		await ctx.answerCallbackQuery();
	}
});

// --- Bot Handlers ---
bot.on("message", async (ctx) => {
	await withCorrelation(async () => {
		logger.debug(
			`Received message: ${ctx.message.text} (ID: ${ctx.message.message_id})`,
		);
		await handleTextMessage(
			ctx,
			ctx.message.text || ctx.message.caption,
			ctx.message.message_id,
			false,
		);
	});
});

bot.on("edited_message", async (ctx) => {
	await withCorrelation(async () => {
		logger.debug(
			`Received edited message: ${ctx.editedMessage?.text} (ID: ${ctx.editedMessage?.message_id})`,
		);
		await handleTextMessage(
			ctx,
			ctx.editedMessage.text || ctx.editedMessage.caption,
			ctx.editedMessage.message_id,
			true,
		);
	});
});

// --- Global Error Handlers ---
process.on(
	"unhandledRejection",
	(reason: unknown, promise: Promise<unknown>) => {
		logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
	},
);

process.on("uncaughtException", (error: Error) => {
	logger.fatal(`Uncaught Exception: ${error.message}\n${error.stack}`);
});

// --- Graceful Shutdown ---
let isShuttingDown = false;
let healthcheckInterval: NodeJS.Timeout | null = null;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		logger.info("Shutdown already in progress, ignoring signal...");
		return;
	}
	isShuttingDown = true;

	logger.info(`Received ${signal}, starting graceful shutdown...`);

	try {
		// Clear healthcheck interval if running
		if (healthcheckInterval) {
			logger.debug("Clearing healthcheck interval...");
			clearInterval(healthcheckInterval);
			healthcheckInterval = null;
		}

		// Stop accepting new updates from Telegram
		logger.info("Stopping bot from accepting new updates...");
		await Promise.race([
			bot.stop(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("bot.stop() timeout")), 5000),
			),
		]);

		// Shut down worker pool
		logger.info("Shutting down worker pool...");
		if (CONFIG.GRACEFUL_DRAIN) {
			logger.info(
				`Graceful drain enabled (timeout: ${CONFIG.GRACEFUL_DRAIN_TIMEOUT_MS}ms)`,
			);
			await workerPool.shutdown({
				drainTasks: true,
				drainTimeoutMs: CONFIG.GRACEFUL_DRAIN_TIMEOUT_MS,
			});
		} else {
			logger.info("Immediate shutdown (graceful drain disabled)");
			workerPool.shutdown();
		}

		logger.info("Graceful shutdown complete.");
		process.exit(0);
	} catch (error) {
		logger.error(`Error during graceful shutdown: ${error}`);
		process.exit(1);
	}
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// --- File-based Healthcheck ---
if (ENABLE_FILE_HEALTHCHECK) {
	logger.info(`File-based healthcheck enabled (file: ${LIVENESS_FILE})`);
	healthcheckInterval = setInterval(() => {
		try {
			writeFileSync(LIVENESS_FILE, Date.now().toString());
		} catch (error) {
			logger.error(`Failed to write liveness file: ${error}`);
		}
	}, LIVENESS_INTERVAL_MS);
}

// --- Final Setup ---
myCommands
	.setCommands(bot)
	.then(() => logger.info("Commands set with Telegram."))
	.catch((err) => logger.error(err, "Failed to set commands"));
bot.use(async (_, next) => {
	await next();
	await dbService.cleanupOldEntries();
});
run(bot);
logger.info("Bot started with hellspawn worker pool and custom logger!");
