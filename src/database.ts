import { sql, SQL } from "bun";
import { CONFIG } from "./config";
import { Logger } from "./logger";
import { SED_PATTERN, getRegexFlags } from "./utils";
import type { Context } from "grammy";
import type { CommandsFlavor } from "@grammyjs/commands";

const logger = new Logger("Database");
const { CLEANUP_INTERVAL_MS, MAX_HISTORY_PER_CHAT, HISTORY_QUERY_LIMIT } =
	CONFIG;

type MyContext = Context & CommandsFlavor;

export class DatabaseService {
	private db: SQL;
	constructor(database: SQL) {
		this.db = database;
	}

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
