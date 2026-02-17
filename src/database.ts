import { sql, SQL } from "bun";
import { CONFIG } from "./config";
import { Logger } from "./logger";
import { SED_PATTERN, getRegexFlags } from "./utils";
import type { MyContext } from "./i18n";

const logger = new Logger("Database");
const { CLEANUP_INTERVAL_MS, MAX_HISTORY_PER_CHAT, HISTORY_QUERY_LIMIT } =
	CONFIG;

/**
 * Service class for managing database operations
 *
 * Handles all SQLite interactions for message history, reply tracking,
 * and cleanup operations. Uses Bun's native SQL support for optimal performance.
 */
export class DatabaseService {
	/** SQLite database instance */
	private db: SQL;

	/**
	 * Creates a new DatabaseService instance
	 * @param database - The SQLite database instance to use
	 */
	constructor(database: SQL) {
		this.db = database;
	}

	/**
	 * Cleans up old entries from message history and bot replies tables
	 *
	 * Removes entries older than CLEANUP_INTERVAL_MS (default 48 hours).
	 * Should be called periodically to prevent memory bloat.
	 *
	 * @returns Promise that resolves when cleanup is complete
	 */
	async cleanupOldEntries(): Promise<void> {
		const cutoffTime = new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString();
		const historyResult = await this
			.db`DELETE FROM message_history WHERE timestamp < ${cutoffTime}`;
		const repliesResult = await this
			.db`DELETE FROM bot_replies WHERE timestamp < ${cutoffTime}`;
		if (historyResult.count > 0 || repliesResult.count > 0) {
			logger.info(
				`Cleaned up ${historyResult.count} history entries and ${repliesResult.count} reply mappings.`,
			);
		}
	}

	/**
	 * Stores a message in the history table
	 *
	 * If the chat has reached MAX_HISTORY_PER_CHAT, oldest entries are removed.
	 * Messages matching SED_PATTERN (sed commands) are not stored.
	 *
	 * @param chatId - The Telegram chat ID
	 * @param messageId - The Telegram message ID
	 * @param text - The message text content
	 * @returns Promise that resolves when storage is complete
	 */
	async storeMessageInHistory(
		chatId: number,
		messageId: number,
		text: string | undefined,
	): Promise<void> {
		if (text && SED_PATTERN.test(text)) return;
		const [{ count }] = await this
			.db`SELECT COUNT(*) as count FROM message_history WHERE chat_id = ${chatId}`;
		if (count >= MAX_HISTORY_PER_CHAT) {
			await this
				.db`DELETE FROM message_history WHERE chat_id = ${chatId} AND message_id IN (SELECT message_id FROM message_history WHERE chat_id = ${chatId} ORDER BY timestamp ASC LIMIT ${count - MAX_HISTORY_PER_CHAT + 1})`;
		}
		await this
			.db`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (${chatId}, ${messageId}, ${text ?? ""})`;
	}

	async storeBotReplyInHistory(
		chatId: number,
		messageId: number,
		text: string | undefined,
	): Promise<void> {
		await this
			.db`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (${chatId}, ${messageId}, ${text ?? ""})`;
	}

	/**
	 * Finds a target message for sed substitution
	 *
	 * First checks for a reply-to message, then searches through
	 * recent history for a message matching the regex pattern.
	 *
	 * @param ctx - The Telegram bot context
	 * @param match - The regex match array from the sed command
	 * @param excludeMessageId - Optional message ID to exclude from search (for edits)
	 * @returns Object containing target message text and ID, or empty object if not found
	 */
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
		const rows = await this
			.db`SELECT message_id, text FROM message_history WHERE chat_id = ${chatId} ${excludeMessageId ? sql`AND message_id != ${excludeMessageId}` : sql``} ORDER BY timestamp DESC LIMIT ${HISTORY_QUERY_LIMIT}`;
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
		await this
			.db`INSERT OR REPLACE INTO bot_replies (target_message_id, chat_id, bot_message_id) VALUES (${targetMessageId}, ${chatId}, ${botMessageId})`;
	}

	async getBotReplyMessageId(
		targetMessageId: number,
		chatId: number,
	): Promise<number | undefined> {
		return (
			await this
				.db`SELECT bot_message_id FROM bot_replies WHERE target_message_id = ${targetMessageId} AND chat_id = ${chatId}`
		)[0]?.bot_message_id;
	}

	async findMessagesInHistory(
		chatId: number,
	): Promise<Array<{ message_id: number; text: string | null }>> {
		return await this
			.db`SELECT message_id, text FROM message_history WHERE chat_id = ${chatId} ORDER BY timestamp DESC`;
	}

	async findRepliesInHistory(
		chatId: number,
	): Promise<Array<{ target_message_id: number; bot_message_id: number }>> {
		return await this
			.db`SELECT target_message_id, bot_message_id FROM bot_replies WHERE chat_id = ${chatId}`;
	}

	async deleteAllMessages(chatId: number): Promise<void> {
		await this.db`DELETE FROM message_history WHERE chat_id = ${chatId}`;
	}

	async deleteAllReplies(chatId: number): Promise<void> {
		await this.db`DELETE FROM bot_replies WHERE chat_id = ${chatId}`;
	}
}
