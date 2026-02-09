import { describe, test, expect, beforeAll } from "bun:test";
import { SQL } from "bun";
import { DatabaseService } from "../database";
import { CONFIG } from "../config";

describe("DatabaseService", () => {
	let db: SQL;
	let dbService: DatabaseService;

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
		dbService = new DatabaseService(db);
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
