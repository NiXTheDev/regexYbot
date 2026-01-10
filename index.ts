import {
	CommandGroup,
	commands,
	type CommandsFlavor,
} from "@grammyjs/commands";
import { run } from "@grammyjs/runner";
import { sql, SQL } from "bun";
import { writeFileSync } from "node:fs";
import { Bot, Context, GrammyError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { Logger } from "./logger";
import { ResultMessage, SedCommand, TaskMessage } from "./types";
import {
	escapeForMarkdownV2AndBackslashes,
	getRegexFlags,
	SED_PATTERN,
} from "./utils";
import { CONFIG } from "./config";

// --- Configuration ---
const token = process.env.TOKEN;
if (!token) {
	const initLogger = new Logger("INIT");
	initLogger.fatal("TOKEN environment variable not set.");
	process.exit(1);
}
const base = (process.env.BASE_URL || "https://api.telegram.org").trim();
const {
	CLEANUP_INTERVAL_MS,
	MAX_CHAIN_LENGTH,
	MAX_MESSAGE_LENGTH,
	WORKER_POOL_SIZE,
	MAX_HISTORY_PER_CHAT,
	HISTORY_QUERY_LIMIT,
	WORKER_TIMEOUT_MS,
	RETRY_MAX_RETRIES,
	RETRY_MAX_DELAY_MS,
} = CONFIG;

// --- Type Definitions ---
type MyContext = Context & CommandsFlavor;

// --- Bot Initialization ---
const logger = new Logger("Main");
logger.info("Initializing bot...");
const bot = new Bot<MyContext>(token, { client: { apiRoot: base } });

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

// --- Database Service ---
class DatabaseService {
	private db: SQL;
	constructor(database: SQL) {
		this.db = database;
	}

	async cleanupOldEntries(): Promise<void> {
		const cutoffTime = new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString();
		const historyResult =
			await db`DELETE FROM message_history WHERE timestamp < ${cutoffTime}`;
		const repliesResult =
			await db`DELETE FROM bot_replies WHERE timestamp < ${cutoffTime}`;
		if (historyResult.count > 0 || repliesResult.count > 0) {
			logger.info(
				`Cleaned up ${historyResult.count} history entries and ${repliesResult.count} reply mappings.`,
			);
		}
	}

	async storeMessageInHistory(
		chatId: number,
		messageId: number,
		text: string | undefined,
	): Promise<void> {
		if (text && SED_PATTERN.test(text)) return;
		const [{ count }] =
			await db`SELECT COUNT(*) as count FROM message_history WHERE chat_id = ${chatId}`;
		if (count >= MAX_HISTORY_PER_CHAT) {
			await db`DELETE FROM message_history WHERE chat_id = ${chatId} AND message_id IN (SELECT message_id FROM message_history WHERE chat_id = ${chatId} ORDER BY timestamp ASC LIMIT ${count - MAX_HISTORY_PER_CHAT + 1})`;
		}
		await db`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (${chatId}, ${messageId}, ${text ?? ""})`;
	}

	async storeBotReplyInHistory(
		chatId: number,
		messageId: number,
		text: string | undefined,
	): Promise<void> {
		await db`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (${chatId}, ${messageId}, ${text ?? ""})`;
	}

	async findTargetMessage(
		ctx: MyContext,
		match: RegExpMatchArray,
		excludeMessageId?: number,
	): Promise<{ targetMsgText?: string; targetMsgId?: number }> {
		if (ctx.msg?.reply_to_message) {
			logger.debug("Found target in reply_to_message.");
			return {
				targetMsgText:
					ctx.msg.reply_to_message.text || ctx.msg.reply_to_message.caption,
				targetMsgId: ctx.msg.reply_to_message.message_id,
			};
		}
		const chatId = ctx.chat?.id;
		if (chatId === undefined) return {};
		const fr = match[1].replace(/\\\//g, "/");
		const regex = new RegExp(fr, getRegexFlags(match[3]).flags);
		const rows =
			await db`SELECT message_id, text FROM message_history WHERE chat_id = ${chatId} ${excludeMessageId ? sql`AND message_id != ${excludeMessageId}` : sql``} ORDER BY timestamp DESC LIMIT ${HISTORY_QUERY_LIMIT}`;
		for (const row of rows) {
			if (row.text && regex.test(row.text)) {
				logger.debug(`Found target in history (msg_id: ${row.message_id}).`);
				return { targetMsgText: row.text, targetMsgId: row.message_id };
			}
		}
		logger.debug("No matching target found in history.");
		return {};
	}

	async storeBotReplyMapping(
		targetMessageId: number,
		chatId: number,
		botMessageId: number,
	): Promise<void> {
		await db`INSERT OR REPLACE INTO bot_replies (target_message_id, chat_id, bot_message_id) VALUES (${targetMessageId}, ${chatId}, ${botMessageId})`;
	}

	async getBotReplyMessageId(
		targetMessageId: number,
		chatId: number,
	): Promise<number | undefined> {
		return (
			await db`SELECT bot_message_id FROM bot_replies WHERE target_message_id = ${targetMessageId} AND chat_id = ${chatId}`
		)[0]?.bot_message_id;
	}
}
const dbService = new DatabaseService(db);

// --- Worker Pool Implementation ---
class WorkerPool {
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
	private timeouts = new Map<Worker, NodeJS.Timeout>();
	private workerScript: string;

	constructor(poolSize: number, workerScript: string) {
		this.workerScript = workerScript;
		logger.info(`Initializing worker pool with size ${poolSize}...`);
		this.workers = Array.from({ length: poolSize }, (_, i) => {
			logger.debug(
				`Creating worker ${i + 1}/${poolSize} from script: ${workerScript}`,
			);
			return this.createWorker(i + 1, poolSize);
		});
		logger.info("Worker pool initialized.");
	}

	private createWorker(_index: number, _total: number): Worker {
		const worker = new Worker(this.workerScript);
		worker.onmessage = (event) => this.handleWorkerMessage(worker, event.data);
		worker.onerror = (error) => this.handleWorkerError(worker, error);
		return worker;
	}

	private replaceWorker(deadWorker: Worker): void {
		const index = this.workers.indexOf(deadWorker);
		if (index !== -1) {
			logger.info(`Replacing worker ${index + 1}/${this.workers.length}...`);
			const newWorker = this.createWorker(index + 1, this.workers.length);
			this.workers[index] = newWorker;
		}
	}

	private handleWorkerMessage(worker: Worker, result: ResultMessage) {
		logger.debug("Received result from a worker.");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			logger.debug("Resolving promise for the completed task.");
			pending.resolve(result);
			this.pendingTasks.delete(worker);
		} else {
			logger.error(
				"Received a message from a worker that wasn't handling a task.",
			);
		}
		this.processQueue();
	}

	private handleWorkerError(worker: Worker, error: ErrorEvent) {
		logger.error(error.error, "WORKER ERROR");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			pending.reject(error.error);
			this.pendingTasks.delete(worker);
		}
		this.replaceWorker(worker);
		this.processQueue();
	}

	private handleWorkerTimeout(worker: Worker): void {
		logger.warn("Worker task timed out, terminating worker.");
		const timeout = this.timeouts.get(worker);
		if (timeout) {
			clearTimeout(timeout);
			this.timeouts.delete(worker);
		}
		const pending = this.pendingTasks.get(worker);
		if (pending) {
			pending.reject(
				new Error(`Regex operation timed out after ${WORKER_TIMEOUT_MS}ms`),
			);
			this.pendingTasks.delete(worker);
		}
		worker.terminate();
		this.replaceWorker(worker);
		this.processQueue();
	}

	private processQueue() {
		if (this.taskQueue.length === 0) {
			logger.debug("Task queue is empty.");
			return;
		}
		const availableWorker = this.workers.find((w) => !this.pendingTasks.has(w));
		if (!availableWorker) {
			logger.debug("All workers busy, task remains in queue.");
			return;
		}
		const { task, resolve, reject } = this.taskQueue.shift()!;
		logger.debug("Assigning task to an available worker.");
		this.pendingTasks.set(availableWorker, { resolve, reject });

		const timeout = setTimeout(() => {
			this.handleWorkerTimeout(availableWorker);
		}, WORKER_TIMEOUT_MS);
		this.timeouts.set(availableWorker, timeout);

		availableWorker.postMessage(task);
	}

	public run(taskData: TaskMessage): Promise<ResultMessage> {
		logger.debug("Adding new task to queue.");
		return new Promise((resolve, reject) => {
			this.taskQueue.push({ task: taskData, resolve, reject });
			this.processQueue();
		});
	}
}
const workerPool = new WorkerPool(WORKER_POOL_SIZE, "./hellspawn.ts");

// --- Bot Logic ---
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

// --- FINAL: Simple, Robust Line-by-Line Parser ---
function parseSedCommands(text: string): string[] {
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
			await handleSedCommand(
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

async function handleSedCommand(
	ctx: MyContext,
	sedCommands: string[],
	targetMsgText: string,
	targetMsgId: number,
	isEdit: boolean,
) {
	logger.debug(
		`Handling ${sedCommands.length} sed command(s) for targetMsgId: ${targetMsgId}`,
	);
	logger.debug(`Commands to execute: ${JSON.stringify(sedCommands)}`);

	const hasPerformanceFlag = sedCommands.some((cmd) => {
		const match = cmd.match(SED_PATTERN);
		return match
			? getRegexFlags(match[3]).originalFlags?.toLowerCase().includes("p")
			: false;
	});

	const startTime = hasPerformanceFlag ? performance.now() : undefined;
	let currentText = targetMsgText;

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

		logger.debug(
			`Executing command: pattern="${commandForWorker.pattern}", flags="${commandForWorker.flags}", replacement="${commandForWorker.replacement}"`,
		);

		try {
			const task: TaskMessage = {
				initialText: currentText,
				commands: [commandForWorker],
				includePerformance: hasPerformanceFlag,
			};
			const result = await workerPool.run(task);
			if (result.error) {
				await ctx.reply(`Error during substitution: ${result.error}`);
				return;
			}
			currentText = result.result;
			logger.debug(`Command result. New text length: ${currentText.length}`);
		} catch (error: unknown) {
			logger.error(String(error), "Worker pool task failed");
			const errorMessage =
				error instanceof Error && error.message.includes("timed out")
					? `Regex operation timed out after ${WORKER_TIMEOUT_MS / 1000}s. Please use a simpler pattern.`
					: "The substitution process failed.";
			await ctx.reply(errorMessage);
			return;
		}
	}

	let totalPerformanceMs: number | null = null;
	if (hasPerformanceFlag && startTime !== undefined) {
		totalPerformanceMs = performance.now() - startTime;
	}

	let finalMessage = currentText.slice(0, MAX_MESSAGE_LENGTH);
	if (totalPerformanceMs !== null) {
		const performanceInfo = ` (⏱️ ${totalPerformanceMs.toFixed(2)}ms)`;
		if (finalMessage.length + performanceInfo.length > MAX_MESSAGE_LENGTH) {
			finalMessage =
				finalMessage.slice(0, MAX_MESSAGE_LENGTH - performanceInfo.length) +
				performanceInfo;
		} else {
			finalMessage += performanceInfo;
		}
	}
	await sendOrEditReply(
		ctx,
		targetMsgId,
		escapeForMarkdownV2AndBackslashes(finalMessage),
		isEdit,
	);
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

bot.on("edited_message", async (ctx) => {
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

// --- File-based Healthcheck ---
if (process.env.ENABLE_FILE_HEALTHCHECK === "true") {
	const livenessFile = process.env.LIVENESS_FILE || "/tmp/bot-alive";
	const livenessInterval = parseInt(
		process.env.LIVENESS_INTERVAL_MS || "30000",
		10,
	);
	logger.info(`File-based healthcheck enabled (file: ${livenessFile})`);
	setInterval(() => {
		try {
			writeFileSync(livenessFile, Date.now().toString());
		} catch (error) {
			logger.error(`Failed to write liveness file: ${error}`);
		}
	}, livenessInterval);
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
