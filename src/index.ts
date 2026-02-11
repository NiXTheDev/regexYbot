import {
	CommandGroup,
	commands,
	type CommandsFlavor,
} from "@grammyjs/commands";
import { run } from "@grammyjs/runner";
import { SQL } from "bun";
import { writeFileSync } from "node:fs";
import { Bot, Context, GrammyError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { CONFIG } from "./config";
import { Logger, withCorrelation } from "./logger";
import { SED_PATTERN } from "./utils";
import { DatabaseService } from "./database";
import { WorkerPool } from "./workerPool";
import { parseSedCommands, SedHandler } from "./sed";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Configuration ---
const {
	TOKEN,
	BASE_URL,
	WORKER_POOL_SIZE,
	RETRY_MAX_RETRIES,
	RETRY_MAX_DELAY_MS,
	ENABLE_FILE_HEALTHCHECK,
	LIVENESS_FILE,
	LIVENESS_INTERVAL_MS,
} = CONFIG;

// --- Type Definitions ---
type MyContext = Context & CommandsFlavor;

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
	logger.info("Database setup complete.");
} catch (error) {
	logger.fatal(`${error}\nDatabase setup failed. Exiting.`);
	process.exit(1);
}

const dbService = new DatabaseService(db);

// --- Worker Pool Setup ---
const __filename = fileURLToPath(import.meta.url);
const workerScriptPath = join(__filename, "..", "hellspawn.ts");
const workerPool = new WorkerPool(WORKER_POOL_SIZE, workerScriptPath);

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
		logger.error("Error sending reply");
		if (
			!(
				error instanceof GrammyError &&
				error.description.includes("Flood control")
			)
		) {
			try {
				await ctx.reply(
					"Failed to send substitution result due to formatting or size.",
				);
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
	await ctx.reply(
		"This bot does not collect or process any user data, apart from a short " +
			"backlog of messages to perform regex substitutions on. These are " +
			"stored in an in-memory sql db for 48h, and can not be accessed by the bot's " +
			"administrator in any way.",
	);
});
myCommands.command("start", "Get a greeting message", async (ctx) => {
	await ctx.reply(
		"Hello! I am a regex bot. Use s/find/replace/flags to substitute text in messages. " +
			"The replacement text can span multiple lines or use escape sequences like `\\n`. " +
			"You can also chain multiple commands, one per line.\n\n" +
			"Special flags:\n" +
			"- `p`: Show performance timing for the entire command chain (e.g., `s/pattern/repl/p`)\n" +
			"Use `\\N` in replacements for captured groups (e.g., `\\1`).",
	);
});
bot.use(myCommands);

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

		// Shut down worker pool - rejects queued tasks and terminates workers
		logger.info("Shutting down worker pool...");
		workerPool.shutdown();

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
