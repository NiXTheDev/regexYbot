import { Bot, Context } from "grammy";
// Import grammY runner
import { run } from "@grammyjs/runner";
// Import the commands plugin and CommandGroup
import {
	commands,
	CommandGroup,
	type CommandsFlavor,
} from "@grammyjs/commands";
import { Database } from "bun:sqlite";
import { GrammyError } from "grammy";

// --- Configuration ---
const token = process.env.TOKEN;
if (!token) {
	console.error("Error: token environment variable not set.");
	process.exit(1);
}
const base = process.env.BASE_URL || "https://api.telegram.org";
const CLEANUP_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
const MAX_CHAIN_LENGTH = 5; // Maximum number of sed commands to process in a chain
const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

// --- Regex for sed command ---
const SED_PATTERN = /^s\/((?:\\.|[^\/])+?)\/((?:\\.|[^\/])*?)(\/.*)?$/;

// --- Type Flavouring ---
// Apply the CommandsFlavor to the Context type
type MyContext = Context & CommandsFlavor;
// Use the flavored context type for the bot
const bot = new Bot<MyContext>(token, { client: { apiRoot: base } });

// --- Install the commands plugin ---
bot.use(commands());

// --- Database Setup ---
const db = new Database(":memory:");

db.run(`
  CREATE TABLE IF NOT EXISTS message_history (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, message_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS bot_replies (
    target_message_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    bot_message_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (target_message_id, chat_id)
  )
`);

db.run(
	`CREATE INDEX IF NOT EXISTS idx_bot_replies_timestamp ON bot_replies (timestamp)`,
);
db.run(
	`CREATE INDEX IF NOT EXISTS idx_message_history_timestamp ON message_history (timestamp)`,
);
// --- End Database Setup ---

// --- Command Group Definition ---
const myCommands = new CommandGroup<MyContext>(); // Use the flavored context type

// Define the /privacy command using the CommandGroup
myCommands.command("privacy", "Show privacy information", async (ctx) => {
	try {
		await ctx.reply(
			"This bot does not collect or process any user data, apart from a short " +
				"backlog of messages to perform regex substitutions on. These are " +
				"stored in an in-memory sql db for 48h, and can not be accessed by the bot's " +
				"administrator in any way.",
		);
	} catch (error) {
		console.error("An error occurred in the privacy command handler:", error);
	}
});

// Define the /start command using the CommandGroup and scope it to private chats
myCommands
	.command("start", "Get a greeting message (private chats only)")
	.addToScope({ type: "all_private_chats" }, async (ctx) => {
		try {
			await ctx.reply(
				"Hello! I am a regex bot. Use s/find/replace/flags to substitute text in messages. You can chain multiple commands, one per line.",
			);
		} catch (error) {
			console.error("An error occurred in the start command handler:", error);
		}
	});

// Register the command group with the bot
bot.use(myCommands);

// --- Helper Functions ---

function cleanupOldEntries() {
	const cutoffTime = new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString();
	const deleteHistoryStmt = db.prepare(
		`DELETE FROM message_history WHERE timestamp < ?`,
	);
	const resultHistory = deleteHistoryStmt.run(cutoffTime);

	const deleteRepliesStmt = db.prepare(
		`DELETE FROM bot_replies WHERE timestamp < ?`,
	);
	const resultReplies = deleteRepliesStmt.run(cutoffTime);

	if (resultHistory.changes > 0 || resultReplies.changes > 0) {
		console.log(
			`Cleaned up ${resultHistory.changes} old history entries and ${resultReplies.changes} old reply mappings.`,
		);
	}
}

function storeMessageInHistory(
	chatId: number,
	messageId: number,
	text: string | undefined,
) {
	// Check if the message being stored is an 's/.../.../' command
	if (text && SED_PATTERN.test(text)) {
		// Do NOT store 's/.../.../' command messages in history
		return;
	}

	const selectOldIdsStmt = db.prepare(`
    SELECT message_id FROM message_history
    WHERE chat_id = ?
    ORDER BY timestamp DESC
    LIMIT 10 OFFSET 10
  `);
	const existingIdsResult = selectOldIdsStmt.all(chatId) as {
		message_id: number;
	}[];
	const existingIds = existingIdsResult.map((row) => row.message_id);

	if (existingIds.length > 0) {
		const placeholders = existingIds.map(() => "?").join(",");
		const deleteStmt = db.prepare(
			`DELETE FROM message_history WHERE chat_id = ? AND message_id IN (${placeholders})`,
		);
		deleteStmt.run(chatId, ...existingIds);
	}

	const insertStmt = db.prepare(
		`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (?, ?, ?)`,
	);
	insertStmt.run(chatId, messageId, text ?? "");
}

async function findTargetMessage(
	ctx: MyContext,
	match: RegExpMatchArray, // This is now just the first match for history lookup if no reply
	excludeMessageId?: number,
) {
	let targetMsgText: string | undefined;
	let targetMsgId: number | undefined;

	const messageToCheck = ctx.msg;

	if (messageToCheck?.reply_to_message) {
		targetMsgText =
			messageToCheck.reply_to_message.text ||
			messageToCheck.reply_to_message.caption;
		targetMsgId = messageToCheck.reply_to_message.message_id;
	} else {
		const chatId = ctx.chat?.id;
		if (chatId !== undefined) {
			let query = `
        SELECT message_id, text FROM message_history
        WHERE chat_id = ?
      `;
			const params: (number | string)[] = [chatId];

			if (excludeMessageId !== undefined) {
				query += ` AND message_id != ?`;
				params.push(excludeMessageId);
			}

			query += ` ORDER BY timestamp DESC LIMIT 10`;

			const selectStmt = db.prepare(query);
			const rows = selectStmt.all(...params) as {
				message_id: number;
				text: string;
			}[];

			for (const row of rows) {
				const testText = row.text;
				// Use the first command pattern from the chain to find the initial target
				const fr = match[1].replace(/\\\//g, "/");
				const regex = new RegExp(fr, getRegexFlags(match[3]));
				if (testText && regex.test(testText)) {
					targetMsgText = testText;
					targetMsgId = row.message_id;
					break;
				}
			}
		}
	}
	return { targetMsgText, targetMsgId };
}

function getRegexFlags(flagsMatch: string | undefined): string {
	if (!flagsMatch) return "";
	return flagsMatch.substring(1).toLowerCase();
}

// Apply substitution with a timeout check
function applySubstitutionWithTimeout(
	text: string,
	match: RegExpMatchArray,
	timeoutMs: number = 60000,
): Promise<{ result: string; matched: boolean } | null> {
	return new Promise((resolve, reject) => {
		const fr = match[1].replace(/\\\//g, "/");
		// --- NEW: Convert \1, \2, etc. in the replacement string to $1, $2, etc. ---
		let rawTo = match[2].replace(/\\\//g, "/");
		// Use a regex to find \ followed by one or more digits
		// Replace \N with $N
		const convertedTo = rawTo.replace(/\\(\d+)/g, '$$$1'); // '$$$1' results in '$' + '$1' which is the literal '$1'
		// --- END NEW ---
		const flags = getRegexFlags(match[3]);

		const globalFlag = flags.includes("g") ? "g" : "";
		const otherFlags = flags.replace("g", "");
		const regex = new RegExp(fr, otherFlags + globalFlag);

		// Set up timeout
		const timeoutId = setTimeout(() => {
			console.log("Substitution timed out after " + timeoutMs + "ms.");
			resolve(null); // Indicate timeout/abort
		}, timeoutMs);

		try {
			// Execute the potentially slow regex
			// Use the converted replacement string
			const result = text.replace(regex, convertedTo);
			// Clear timeout if substitution finished quickly
			clearTimeout(timeoutId);
			resolve({ result, matched: result !== text });
		} catch (error) {
			clearTimeout(timeoutId);
			console.error("Error during substitution:", error);
			reject(error);
		}
	});
}

function storeBotReplyMapping(
	targetMessageId: number,
	chatId: number,
	botMessageId: number,
) {
	const insertMapStmt = db.prepare(
		`INSERT OR REPLACE INTO bot_replies (target_message_id, chat_id, bot_message_id) VALUES (?, ?, ?)`,
	);
	insertMapStmt.run(targetMessageId, chatId, botMessageId);
}

function getBotReplyMessageId(
	targetMessageId: number,
	chatId: number,
): number | undefined {
	const selectMapStmt = db.prepare(`
    SELECT bot_message_id FROM bot_replies
    WHERE target_message_id = ? AND chat_id = ?
  `);
	const row = selectMapStmt.get(targetMessageId, chatId) as
		| { bot_message_id: number }
		| undefined;
	return row?.bot_message_id;
}

// Function to escape MarkdownV2 special characters in a string
function escapeMarkdownV2(text: string): string {
	// Telegram MarkdownV2 requires escaping these characters:
	// _, *, [, ], (, ), ~, ` (backtick), >, #, +, -, =, |, {, }, ., !
	// The backslash itself also needs escaping if it's not already part of an escape sequence.
	// This regex replaces each special character with a backslash followed by the character.
	// Standard list of chars to escape: _ * [ ] ( ) ~ ` > # + - = | { } . !
	// Regex: /([_*\[\]()~`>#+\-=|{}.!])/g
	// Replace with: \\$1
	return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// --- Bot Handlers ---

bot.on("message", async (ctx) => {
	try {
		if (ctx.message && !ctx.message.text?.startsWith("/")) {
			storeMessageInHistory(
				ctx.chat.id,
				ctx.message.message_id,
				ctx.message.text || ctx.message.caption,
			);
		}

		if (ctx.message?.text && ctx.message.text.includes("s/")) {
			// Split the message text by newlines to get potential commands
			const lines = ctx.message.text.split("\n");
			// Filter lines that match the SED_PATTERN
			const sedCommands = lines.filter((line) => SED_PATTERN.test(line.trim()));

			if (sedCommands.length > 0) {
				// Parse the first command to find the target (for history lookup)
				const firstMatch = sedCommands[0].match(SED_PATTERN);
				if (!firstMatch) {
					// This should theoretically not happen if the filter worked correctly
					return;
				}

				const { targetMsgText, targetMsgId } = await findTargetMessage(
					ctx,
					firstMatch,
					undefined,
				);

				// Check if the target message text itself is an 's/.../.../' command
				if (targetMsgText && targetMsgId && SED_PATTERN.test(targetMsgText)) {
					console.log("Target message is an 's/.../.../' command, ignoring.");
					return; // Do nothing, don't process further
				}

				if (targetMsgText && targetMsgId) {
					// --- Process the chain of commands ---
					let currentText = targetMsgText;
					let allResults: {
						pattern: string;
						result: string;
						matched: boolean;
					}[] = [];
					let chainErrored = false;
					let chainTimedOut = false;

					// Limit the chain length
					const commandsToProcess = sedCommands.slice(0, MAX_CHAIN_LENGTH);

					for (const cmdLine of commandsToProcess) {
						const match = cmdLine.match(SED_PATTERN);
						if (!match) continue; // Shouldn't happen due to filter, but safe check

						const substitutionResult = await applySubstitutionWithTimeout(
							currentText,
							match,
							60000, // 60 second timeout per command
						);

						if (substitutionResult === null) {
							chainTimedOut = true;
							break; // Stop processing the chain
						}

						const { result, matched } = substitutionResult;
						allResults.push({ pattern: cmdLine, result, matched });
						currentText = result; // Feed the result into the next command

						// Check if the intermediate result is getting too long
						// We'll check against a threshold before adding more intermediaries
						if (currentText.length > MAX_MESSAGE_LENGTH) {
							// Stop processing further commands if the result is too long
							// This is a simplification; a more robust check would factor in the summary message length too.
							break;
						}
					}

					// --- Format the response ---
					if (chainErrored) {
						await ctx.reply("An error occurred during the substitution chain.");
						return;
					}
					if (chainTimedOut) {
						await ctx.reply("The substitution chain took too long (timeout).");
						return;
					}

					// If no commands matched anything, inform the user
					if (allResults.every((r) => !r.matched)) {
						await ctx.reply("Substitution patterns did not match.");
						return;
					}

					// Build the final message: just the result of the chain
					let finalMessage = currentText;

					// --- NO INTERMEDIARY SUMMARY ---
					// --- TRIM TO MAX LENGTH ---
					if (finalMessage.length > MAX_MESSAGE_LENGTH) {
						// Truncate the final result if it's too long
						finalMessage = finalMessage.slice(0, MAX_MESSAGE_LENGTH);
					}

					// Send the final formatted message
					// Note: Using parse_mode: "MarkdownV2" for potential markdown chars in the final result
					// Escape the final message text before sending.
					finalMessage = escapeMarkdownV2(finalMessage);
					try {
						const sentMsg = await ctx.api.sendMessage(
							ctx.chat.id,
							finalMessage,
							{
								reply_parameters: { message_id: targetMsgId },
								parse_mode: "MarkdownV2",
							},
						);
						storeBotReplyMapping(targetMsgId, ctx.chat.id, sentMsg.message_id);
					} catch (e) {
						console.error("Error sending reply for sed command chain:", e);
						if (
							e instanceof GrammyError &&
							e.description.includes("Flood control")
						) {
							console.warn("Flood control hit when sending sed reply chain.");
						} else {
							// Attempt to send a simpler message if the formatted one failed
							try {
								await ctx.reply(
									"Failed to send detailed substitution result due to formatting or size.",
								);
							} catch (e2) {
								console.error("Failed to send fallback message:", e2);
							}
						}
					}
				} else {
					// No target found for the chain
					await ctx.reply("Could not find a matching message to substitute.");
				}
			}
		}
	} catch (error) {
		console.error("An error occurred in the message handler:", error);
		// Optionally notify the user, but be careful not to cause an infinite loop
		// if the error itself is related to sending messages.
		// For now, just log it.
	}
});

bot.on("edited_message", async (ctx) => {
	try {
		if (ctx.editedMessage?.text && ctx.editedMessage.text.includes("s/")) {
			const lines = ctx.editedMessage.text.split("\n");
			const sedCommands = lines.filter((line) => SED_PATTERN.test(line.trim()));

			if (sedCommands.length > 0) {
				const firstMatch = sedCommands[0].match(SED_PATTERN);
				if (!firstMatch) {
					return;
				}

				// Pass the edited message ID to exclude it from history lookup during edits
				const { targetMsgText, targetMsgId } = await findTargetMessage(
					ctx,
					firstMatch,
					ctx.editedMessage.message_id,
				);

				// Check if the target message text itself is an 's/.../.../' command
				if (targetMsgText && targetMsgId && SED_PATTERN.test(targetMsgText)) {
					console.log(
						"Target message (during edit) is an 's/.../.../' command, ignoring.",
					);
					return; // Do nothing, don't process further
				}

				if (targetMsgText && targetMsgId) {
					// --- Process the chain of commands (similar to message handler) ---
					let currentText = targetMsgText;
					let allResults: {
						pattern: string;
						result: string;
						matched: boolean;
					}[] = [];
					let chainErrored = false;
					let chainTimedOut = false;

					const commandsToProcess = sedCommands.slice(0, MAX_CHAIN_LENGTH);

					for (const cmdLine of commandsToProcess) {
						const match = cmdLine.match(SED_PATTERN);
						if (!match) continue;

						const substitutionResult = await applySubstitutionWithTimeout(
							currentText,
							match,
							60000,
						);

						if (substitutionResult === null) {
							chainTimedOut = true;
							break;
						}

						const { result, matched } = substitutionResult;
						allResults.push({ pattern: cmdLine, result, matched });
						currentText = result;

						if (currentText.length > MAX_MESSAGE_LENGTH) {
							break;
						}
					}

					if (chainErrored) {
						// Handle error during edit - maybe send a new message or edit an existing bot reply if possible
						// For simplicity, let's just log and potentially send a new message
						console.error("Error occurred during sed chain edit processing.");
						return; // Or handle error state in mapping if needed
					}
					if (chainTimedOut) {
						// Handle timeout during edit
						const previousBotReplyId = getBotReplyMessageId(
							targetMsgId,
							ctx.chat.id,
						);
						if (previousBotReplyId) {
							try {
								await ctx.api.editMessageText(
									ctx.chat.id,
									previousBotReplyId,
									"(Substitution chain timed out)",
									{ parse_mode: "MarkdownV2" }, // Ensure parse mode is set if the original had it
								);
								storeBotReplyMapping(
									targetMsgId,
									ctx.chat.id,
									previousBotReplyId,
								);
							} catch (e) {
								if (
									e instanceof GrammyError &&
									e.description.includes("message is not modified")
								) {
									console.log(
										`Bot reply ${previousBotReplyId} (timeout) for target ${targetMsgId} was not modified, ignoring.`,
									);
									return;
								} else {
									console.error("Error editing bot reply for timeout case:", e);
									try {
										const newReplyMsg = await ctx.api.sendMessage(
											ctx.chat.id,
											"(Substitution chain timed out)",
											{
												reply_parameters: { message_id: targetMsgId },
												parse_mode: "MarkdownV2",
											},
										);
										storeBotReplyMapping(
											targetMsgId,
											ctx.chat.id,
											newReplyMsg.message_id,
										);
									} catch (e2) {
										console.error(
											"Failed to send new reply for timeout case:",
											e2,
										);
									}
								}
							}
						} else {
							try {
								const newReplyMsg = await ctx.api.sendMessage(
									ctx.chat.id,
									"(Substitution chain timed out)",
									{
										reply_parameters: { message_id: targetMsgId },
										parse_mode: "MarkdownV2",
									},
								);
								storeBotReplyMapping(
									targetMsgId,
									ctx.chat.id,
									newReplyMsg.message_id,
								);
							} catch (e) {
								console.error(
									"Failed to send new reply for timeout case (no previous):",
									e,
								);
							}
						}
						return; // Stop further processing after timeout
					}

					// If no commands matched anything
					if (allResults.every((r) => !r.matched)) {
						const previousBotReplyId = getBotReplyMessageId(
							targetMsgId,
							ctx.chat.id,
						);
						if (previousBotReplyId) {
							try {
								await ctx.api.editMessageText(
									ctx.chat.id,
									previousBotReplyId,
									"(No match for edited pattern chain)",
									{ parse_mode: "MarkdownV2" }, // Ensure parse mode is set if the original had it
								);
								storeBotReplyMapping(
									targetMsgId,
									ctx.chat.id,
									previousBotReplyId,
								);
							} catch (e) {
								if (
									e instanceof GrammyError &&
									e.description.includes("message is not modified")
								) {
									console.log(
										`Bot reply ${previousBotReplyId} (no match) for target ${targetMsgId} was not modified, ignoring.`,
									);
									return;
								} else {
									console.error(
										"Error editing bot reply for no-match case:",
										e,
									);
									try {
										const newReplyMsg = await ctx.api.sendMessage(
											ctx.chat.id,
											"(No match for edited pattern chain)",
											{
												reply_parameters: { message_id: targetMsgId },
												parse_mode: "MarkdownV2",
											},
										);
										storeBotReplyMapping(
											targetMsgId,
											ctx.chat.id,
											newReplyMsg.message_id,
										);
									} catch (e2) {
										console.error(
											"Failed to send new reply for no-match case:",
											e2,
										);
									}
								}
							}
						} else {
							try {
								const newReplyMsg = await ctx.api.sendMessage(
									ctx.chat.id,
									"(No match for edited pattern chain)",
									{
										reply_parameters: { message_id: targetMsgId },
										parse_mode: "MarkdownV2",
									},
								);
								storeBotReplyMapping(
									targetMsgId,
									ctx.chat.id,
									newReplyMsg.message_id,
								);
							} catch (e) {
								console.error(
									"Failed to send new reply for no-match case (no previous):",
									e,
								);
							}
						}
						return; // Stop further processing after no match
					}

					// Build the final message for the edit: just the result of the chain
					let finalMessage = currentText;

					// --- NO INTERMEDIARY SUMMARY ---
					// --- TRIM TO MAX LENGTH ---
					if (finalMessage.length > MAX_MESSAGE_LENGTH) {
						// Truncate the final result if it's too long
						finalMessage = finalMessage.slice(0, MAX_MESSAGE_LENGTH);
					}

					// --- Handle editing or sending the new message ---
					const previousBotReplyId = getBotReplyMessageId(
						targetMsgId,
						ctx.chat.id,
					);
					if (previousBotReplyId) {
						try {
							// Edit the message, ensuring parse_mode is MarkdownV2
							// Escape the final message text before sending.
							finalMessage = escapeMarkdownV2(finalMessage);
							await ctx.api.editMessageText(
								ctx.chat.id,
								previousBotReplyId,
								finalMessage,
								{ parse_mode: "MarkdownV2" },
							);
							storeBotReplyMapping(
								targetMsgId,
								ctx.chat.id,
								previousBotReplyId,
							);
							console.log(
								`Edited bot reply ${previousBotReplyId} for target ${targetMsgId} (chain)`,
							);
						} catch (e) {
							if (
								e instanceof GrammyError &&
								e.description.includes("message is not modified")
							) {
								console.log(
									`Bot reply ${previousBotReplyId} for target ${targetMsgId} (chain) was not modified, ignoring.`,
								);
								return;
							} else {
								console.error(
									"Error editing bot reply (chain), sending new one:",
									e,
								);
								try {
									const newReplyMsg = await ctx.api.sendMessage(
										ctx.chat.id,
										// Escape the final message text before sending.
										escapeMarkdownV2(finalMessage),
										{
											reply_parameters: { message_id: targetMsgId },
											parse_mode: "MarkdownV2", // Ensure parse mode is set
										},
									);
									storeBotReplyMapping(
										targetMsgId,
										ctx.chat.id,
										newReplyMsg.message_id,
									);
								} catch (e2) {
									console.error(
										"Failed to send new reply after edit failed (chain):",
										e2,
									);
								}
							}
						}
					} else {
						console.warn(
							`No previous bot reply found for target ${targetMsgId} during edit (chain), sending new.`,
						);
						try {
							const newReplyMsg = await ctx.api.sendMessage(
								ctx.chat.id,
								// Escape the final message text before sending.
								escapeMarkdownV2(finalMessage),
								{
									reply_parameters: { message_id: targetMsgId },
									parse_mode: "MarkdownV2", // Ensure parse mode is set
								},
							);
							storeBotReplyMapping(
								targetMsgId,
								ctx.chat.id,
								newReplyMsg.message_id,
							);
						} catch (e) {
							console.error(
								"Failed to send new reply during edit handling (chain):",
								e,
							);
						}
					}
				} else {
					console.log(
						"Edited sed command chain no longer finds a target message.",
					);
				}
			}
		} else if (ctx.editedMessage) {
			storeMessageInHistory(
				ctx.chat.id,
				ctx.editedMessage.message_id,
				ctx.editedMessage.text || ctx.editedMessage.caption,
			);
		}
	} catch (error) {
		console.error("An error occurred in the edited_message handler:", error);
		// Optionally notify the user, but be careful not to cause an infinite loop.
		// For now, just log it.
	}
});

// Register the /privacy and /start commands with Telegram's UI using the CommandGroup
// This should happen *after* the CommandGroup is defined but *before* the bot starts.
myCommands.setCommands(bot).catch((err) => {
	console.error("Failed to set commands with Telegram:", err);
});

bot.use(async (_, next) => {
	await next();
	cleanupOldEntries();
});

// Use runner.start instead of bot.start
run(bot);
console.log("Bot started using runner!");
// Note: The runner handles startup and connection management.
// The original `bot.start({...})` call is replaced by `run(bot, {...})`.
