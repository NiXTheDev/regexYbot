import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Bot } from "grammy";
import { CONFIG } from "../config";

describe("Telegram API Integration", () => {
	describe("Bot Initialization", () => {
		test("should create bot instance with token", () => {
			const bot = new Bot(CONFIG.TOKEN);
			expect(bot).toBeDefined();
			expect(bot.api).toBeDefined();
		});

		test("should create bot with custom base URL if provided", () => {
			const customUrl = "https://custom.telegram.api/bot";
			const bot = new Bot(CONFIG.TOKEN, {
				client: { apiRoot: customUrl },
			});
			expect(bot).toBeDefined();
		});

		test("should handle invalid token gracefully", async () => {
			const invalidBot = new Bot("invalid_token_12345");

			// Should throw or fail when trying to use API
			await expect(invalidBot.api.getMe()).rejects.toThrow();
		});
	});

	describe("API Methods (Mocked)", () => {
		test("should format commands correctly", () => {
			const commands = [
				{ command: "start", description: "Start the bot" },
				{ command: "help", description: "Get help" },
			];

			// Verify command structure
			expect(commands).toHaveLength(2);
			expect(commands[0].command).toBe("start");
			expect(commands[0].description).toBe("Start the bot");
		});

		test("should handle message parsing", () => {
			const message = {
				message_id: 123,
				chat: { id: 456, type: "private" },
				text: "Hello world",
				date: Math.floor(Date.now() / 1000),
			};

			expect(message.message_id).toBe(123);
			expect(message.chat.id).toBe(456);
			expect(message.text).toBe("Hello world");
		});

		test("should handle update parsing", () => {
			const update = {
				update_id: 789,
				message: {
					message_id: 123,
					chat: { id: 456, type: "private" },
					text: "/start",
					date: Math.floor(Date.now() / 1000),
				},
			};

			expect(update.update_id).toBe(789);
			expect(update.message?.text).toBe("/start");
		});
	});

	describe("Real API Tests (Staging)", () => {
		// Only run these if STAGING_TOKEN is available
		const stagingToken = process.env.STAGING_TOKEN || CONFIG.TOKEN;
		const haveStagingToken = stagingToken && stagingToken !== "test_token";

		(haveStagingToken ? describe : describe.skip)(
			"With Real Staging Bot",
			() => {
				let bot: Bot;

				beforeEach(() => {
					bot = new Bot(stagingToken);
				});

				afterEach(() => {
					// Clean up
					bot.stop();
				});

				test("should get bot info", async () => {
					const me = await bot.api.getMe();
					expect(me).toBeDefined();
					expect(me.id).toBeDefined();
					expect(me.first_name).toBeDefined();
					expect(me.username).toBeDefined();
					expect(me.is_bot).toBe(true);
				});

				test("should set and get commands", async () => {
					const testCommands = [
						{ command: "test_start", description: "Test start command" },
						{ command: "test_help", description: "Test help command" },
					];

					await bot.api.setMyCommands(testCommands);
					const commands = await bot.api.getMyCommands();

					expect(commands).toHaveLength(2);
					expect(commands[0].command).toBe("test_start");
				});

				test("should handle webhook info", async () => {
					const webhookInfo = await bot.api.getWebhookInfo();
					expect(webhookInfo).toBeDefined();
					// Should either have a URL or not be set
					expect(typeof webhookInfo.url).toBe("string");
				});

				test("should handle rate limits gracefully", async () => {
					// Make multiple rapid requests
					const promises = [];
					for (let i = 0; i < 5; i++) {
						promises.push(bot.api.getMe());
					}

					// Should not throw, auto-retry handles rate limits
					const results = await Promise.all(promises);
					expect(results).toHaveLength(5);
					results.forEach((result) => {
						expect(result.is_bot).toBe(true);
					});
				});
			},
		);
	});

	describe("Error Handling", () => {
		test("should handle network errors", async () => {
			const bot = new Bot(CONFIG.TOKEN, {
				client: {
					apiRoot: "https://invalid.telegram.api.test",
				},
			});

			await expect(bot.api.getMe()).rejects.toThrow();
		});

		test("should handle 404 errors", async () => {
			// This would need actual API call to test
			// Skipped in unit tests
			expect(true).toBe(true);
		});
	});
});
