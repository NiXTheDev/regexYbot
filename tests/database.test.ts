import { describe, test, expect, beforeAll } from "bun:test";
import { SQL } from "bun";

const CONFIG = {
	CLEANUP_INTERVAL_MS: 48 * 60 * 60 * 1000,
	CLEANUP_HOURS: 48,
	MAX_CHAIN_LENGTH: 5,
	MAX_MESSAGE_LENGTH: 4096,
	WORKER_POOL_SIZE: 4,
	MAX_HISTORY_PER_CHAT: 20,
	HISTORY_QUERY_LIMIT: 10,
	WORKER_TIMEOUT_MS: 60 * 1000,
} as const;

class TestDatabaseService {
	private db: SQL;

	constructor(database: SQL) {
		this.db = database;
	}

	async cleanupOldEntries(): Promise<void> {
		const cutoffTime = new Date(
			Date.now() - CONFIG.CLEANUP_INTERVAL_MS,
		).toISOString();
		await this.db`DELETE FROM message_history WHERE timestamp < ${cutoffTime}`;
		await this.db`DELETE FROM bot_replies WHERE timestamp < ${cutoffTime}`;
	}

	async storeMessageInHistory(
		chatId: number,
		messageId: number,
		text: string | undefined,
	): Promise<void> {
		const [{ count }] = await this
			.db`SELECT COUNT(*) as count FROM message_history WHERE chat_id = ${chatId}`;
		if (count >= CONFIG.MAX_HISTORY_PER_CHAT) {
			await this
				.db`DELETE FROM message_history WHERE chat_id = ${chatId} AND message_id IN (SELECT message_id FROM message_history WHERE chat_id = ${chatId} ORDER BY timestamp ASC LIMIT ${count - CONFIG.MAX_HISTORY_PER_CHAT + 1})`;
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

describe("DatabaseService", () => {
	let db: SQL;
	let dbService: TestDatabaseService;

	beforeAll(async () => {
		db = new SQL("sqlite://:memory:");
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
		dbService = new TestDatabaseService(db);
	});

	describe("storeMessageInHistory", () => {
		test("should store a message in history", async () => {
			await dbService.storeMessageInHistory(12345, 100, "Hello world");

			const messages = await dbService.findMessagesInHistory(12345);
			expect(messages.length).toBe(1);
			expect(messages[0].message_id).toBe(100);
			expect(messages[0].text).toBe("Hello world");
		});

		test("should handle undefined text", async () => {
			await dbService.storeMessageInHistory(12345, 101, undefined);

			const messages = await dbService.findMessagesInHistory(12345);
			expect(messages.length).toBe(2);
			const msg = messages.find((m) => m.message_id === 101);
			expect(msg?.text).toBe("");
		});

		test("should replace existing message with same chat_id and message_id", async () => {
			await dbService.storeMessageInHistory(12345, 100, "Original");
			await dbService.storeMessageInHistory(12345, 100, "Updated");

			const messages = await dbService.findMessagesInHistory(12345);
			expect(messages.length).toBe(2);
			const msg = messages.find((m) => m.message_id === 100);
			expect(msg?.text).toBe("Updated");
		});
	});

	describe("storeBotReplyMapping", () => {
		test("should store a bot reply mapping", async () => {
			await dbService.storeBotReplyMapping(100, 12345, 200);

			const replyId = await dbService.getBotReplyMessageId(100, 12345);
			expect(replyId).toBe(200);
		});

		test("should replace existing mapping", async () => {
			await dbService.storeBotReplyMapping(100, 12345, 200);
			await dbService.storeBotReplyMapping(100, 12345, 300);

			const replyId = await dbService.getBotReplyMessageId(100, 12345);
			expect(replyId).toBe(300);
		});

		test("should return undefined for non-existent mapping", async () => {
			const replyId = await dbService.getBotReplyMessageId(99999, 12345);
			expect(replyId).toBeUndefined();
		});
	});

	describe("cleanupOldEntries", () => {
		test("should clean up entries older than cleanup interval", async () => {
			const chatId = 99999;

			await dbService.storeMessageInHistory(chatId, 1, "Old message");
			await dbService.storeBotReplyMapping(1, chatId, 2);

			await dbService.cleanupOldEntries();

			const messages = await dbService.findMessagesInHistory(chatId);
			const replies = await dbService.findRepliesInHistory(chatId);

			expect(messages.length).toBe(1);
			expect(replies.length).toBe(1);
		});
	});

	describe("message history limit", () => {
		test("should respect MAX_HISTORY_PER_CHAT limit", async () => {
			const chatId = 88888;

			for (let i = 0; i < 25; i++) {
				await dbService.storeMessageInHistory(chatId, i, `Message ${i}`);
			}

			const messages = await dbService.findMessagesInHistory(chatId);
			expect(messages.length).toBeLessThanOrEqual(
				CONFIG.MAX_HISTORY_PER_CHAT + 1,
			);
		});
	});
});
