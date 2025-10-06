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
	console.error("Error: TOKEN environment variable not set.");
	process.exit(1);
}
// Fix: Remove trailing spaces from the base URL and use correct option name
const base = (process.env.BASE_URL || "https://api.telegram.org").trim();
const CLEANUP_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
const MAX_CHAIN_LENGTH = 5; // Maximum number of sed commands to process in a chain
const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

// --- Regex for sed command ---
const SED_PATTERN = /^s\/((?:\\.|[^\/])+?)\/((?:\\.|[^\/])*?)(\/.*)?$/;

// --- Type Flavouring ---
// Apply the CommandsFlavor to the Context type
type MyContext = Context & CommandsFlavor;
// Use the flavored context type for the bot
const bot = new Bot<MyContext>(token, { client: { apiRoot: base } }); // Use client.apiRoot

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

// --- NEW: Helper function to store bot's own replies in history ---
// Simplified version: Assumes cleanupOldEntries handles pruning
function storeBotReplyInHistory(
	chatId: number,
	messageId: number,
	text: string | undefined,
) {
	// Bot replies should generally be stored for potential non-reply substitutions.
	// We bypass the SED_PATTERN check here to allow bot replies containing 's/.../' text
	// to be used as targets themselves.

	const insertStmt = db.prepare(
		`INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (?, ?, ?)`,
	);
	// Ensure text is never undefined for storage
	insertStmt.run(chatId, messageId, text ?? "");
}
// --- END NEW ---

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
async function applySubstitutionWithTimeout(
    text: string,
    match: RegExpMatchArray,
    timeoutMs: number = 60000,
): Promise<{ result: string; matched: boolean } | null> {

    // --- Process the 'from' (pattern) and 'to' (replacement) parts ---
    const fr = match[1].replace(/\\\//g, "/"); // Clean the 'from' pattern
    let rawTo = match[2].replace(/\\\//g, "/"); // Clean the 'to' part
    // Convert user's \N syntax to JS's $N syntax for the replacement string
    const processedTo = rawTo.replace(/\\(\d+)/g, '$$$1'); // Convert \N to $N
    const flags = getRegexFlags(match[3]);
    // --- End processing of parts ---

    // --- Spawn the subprocess to perform the regex ---
    const proc = Bun.spawn([
        "bun", // Command to run Bun
        "hellspawn.ts", // Path to the script (adjust if needed)
        text,    // Pass the target text as argument 1
        fr,      // Pass the cleaned pattern as argument 2
        flags,   // Pass the flags as argument 3
        processedTo // Pass the *processed* replacement string as argument 4
    ]);
    // --- End spawning subprocess ---

    // --- Set up the main thread timeout ---
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            console.log(`Substitution process for pattern /${fr}/ timed out after ${timeoutMs}ms, killing process.`);
            proc.kill(); // Kill the spawned subprocess
            // Resolve with null to indicate timeout
            resolve(null);
        }, timeoutMs);
        // --- End timeout setup ---

        // --- Wait for the subprocess to finish ---
        (async () => {
            try {
                // Wait for the subprocess to exit
                const exitCode = await proc.exited;

                // Clear the timeout if the process finished in time
                clearTimeout(timeoutId);

                if (exitCode === 0) {
                    // Process finished successfully
                    const rawOutput = await new Response(proc.stdout).text();
                    const result = rawOutput.trimEnd(); // Get output and remove trailing newline

                    // Determine if a match occurred by comparing input and output
                    const matched = result !== text;
                    resolve({ result, matched });
                } else {
                    // Process failed or was killed due to timeout
                    const rawStderr = await new Response(proc.stderr).text();
                    const stderr = rawStderr.trim();
                    if (stderr) {
                        console.error(`Subprocess error for /${fr}/: ${stderr}`);
                    } else {
                        console.error(`Subprocess for /${fr}/ exited with code ${exitCode}, no stderr.`);
                    }

                    // If exitCode was due to timeout (proc.kill()), stderr might be empty
                    // or indicate termination. We resolve with null for any non-zero exit.
                    resolve(null); // Indicate failure/timeout
                }
            } catch (error) {
                // Clear the timeout in case of an unexpected error awaiting the process
                clearTimeout(timeoutId);
                console.error("Unexpected error waiting for subprocess:", error);
                // Reject the promise if there's an unexpected error in the spawning/awaiting logic
                reject(error);
            }
        })();
        // --- End waiting for subprocess ---
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

// --- CORRECTED ESCAPING FUNCTION ---
// Function to escape MarkdownV2 special characters and literal backslashes correctly
// Order matters: escape backslashes first, then Markdown chars.
function escapeForMarkdownV2AndBackslashes(text: string): string {
	// 1. First, escape any literal backslashes in the original text.
	// One \ becomes \\.
	let escapedText = text.replace(/\\/g, "\\\\");

	// 2. Then, escape all MarkdownV2 special characters with a single backslash.
	// This correctly handles |, ., -, etc., without affecting the \\ from step 1.
	// The regex includes \\ to ensure we don't double-process backslashes,
	// but the replacement logic handles it correctly because we are prepending \.
	// The key is that step 1 turned all \ into \\.
	// Step 2 finds \\ and turns it into \\. (Which is correct, it stays \\).
	// Step 2 finds | and turns it into \|. (Correct).
	// Example trace for "A \\ B |":
	// After step 1: "A \\\\ B |"
	// In step 2 regex /[\\_*...]/g:
	// Match 1: \\ (1st \). $1="\". Replace with \\. Result starts "A \\\\\...".
	// Match 2: \\ (2nd \). $1="\". Replace with \\. Result "A \\\\\\\\ B |".
	// Match 3: |. $1="|". Replace with \|". Final "A \\\\\\\\ B \\|".
	// This is still wrong because the \\ from step 1 is being escaped again.
	// The problem is that the character class [\\...] includes \.
	// When we find \, we replace it with \\. This is incorrect for the \ we just added.
	// We only want to escape the Markdown special chars, not the backslashes we just used for escaping.
	// The correct way is to escape Markdown chars first, then backslashes.
	// But that leads to the original problem.
	// Let's try escaping backslashes first, then Markdown chars, but be smarter in the Markdown step.
	// The issue is the regex in step 2 matches \. We don't want it to match the \ we just added for escaping other chars.
	// A better approach: Escape backslashes. Then escape Markdown chars, but be aware that some \ might now be part of \\.
	// Let's try the correct order again, and see if the regex is the issue.
	// Correct Order:
	// 1. Escape literal backslashes: \ -> \\
	// 2. Escape Markdown special chars: | -> \|, but do NOT re-escape the \ from step 1 if it forms \\.
	// How to express "escape Markdown chars but not if they are part of \\"?
	// It's complex. Let's stick to the "escape backslashes first" logic, but ensure the Markdown regex doesn't double-process.
	// The problem in the previous trace was misinterpreting how the regex works.
	// Let's trace carefully with the CORRECT order (backslashes FIRST):
	// Original: "A \\ B | C _"
	// Step 1 (Escape backslashes): text.replace(/\\/g, '\\\\') -> "A \\\\ B | C _"
	// Step 2 (Escape Markdown): escapedText.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
	// Regex finds each character in the class:
	// Finds | : $1="|". Replace with \| -> "A \\\\ B \\| C _"
	// Finds _ : $1="_". Replace with \_ -> "A \\\\ B \\| C \\_"
	// This looks correct. The \\ from step 1 is left untouched by step 2 because \ is not in the character class used in step 2's regex.
	// Ah! My previous trace was wrong. The character class in step 2 was `[_*...\\]`. It SHOULD NOT include `\\`.
	// The character class should only be the Markdown special chars.
	// Let's redefine the function with the CORRECT regex (excluding \\ from the Markdown escape class).

	// 1. Escape literal backslashes first.
	escapedText = text.replace(/\\/g, "\\\\");
	// 2. Escape Markdown special chars. The regex MUST NOT include \\ or \.
	// Standard MarkdownV2 special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
	escapedText = escapedText.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");

	return escapedText;
}
// --- END CORRECTED ESCAPING FUNCTION ---

// --- Bot Handlers ---

bot.on("message", async (ctx) => {
	try {
		// --- Store incoming user messages in history ---
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
						if (currentText.length > MAX_MESSAGE_LENGTH) {
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

					// --- TRIM TO MAX LENGTH ---
					if (finalMessage.length > MAX_MESSAGE_LENGTH) {
						finalMessage = finalMessage.slice(0, MAX_MESSAGE_LENGTH);
					}

					// Send the final formatted message
					// Note: Using parse_mode: "MarkdownV2"
					// CRITICAL FIX: Escape the final message text for MarkdownV2 AND literal backslashes correctly
					finalMessage = escapeForMarkdownV2AndBackslashes(finalMessage);

					try {
						const sentMsg = await ctx.api.sendMessage(
							ctx.chat.id,
							finalMessage,
							{
								reply_parameters: { message_id: targetMsgId },
								parse_mode: "MarkdownV2", // Enable MarkdownV2 formatting
							},
						);
						storeBotReplyMapping(targetMsgId, ctx.chat.id, sentMsg.message_id);
						// --- NEW: Store the bot's sent reply in history ---
						storeBotReplyInHistory(
							ctx.chat.id,
							sentMsg.message_id,
							finalMessage, // Use the potentially trimmed/escaped text
						);
						// --- END NEW ---
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
	}
});

bot.on("edited_message", async (ctx) => {
	try {
		// --- Store edited user messages in history ---
		if (ctx.editedMessage?.text && !ctx.editedMessage.text.startsWith("/")) {
			storeMessageInHistory(
				ctx.chat.id,
				ctx.editedMessage.message_id,
				ctx.editedMessage.text || ctx.editedMessage.caption,
			);
		}

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
						console.error("Error occurred during sed chain edit processing.");
						return;
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
									{ parse_mode: "MarkdownV2" },
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
										storeBotReplyInHistory(
											ctx.chat.id,
											newReplyMsg.message_id,
											"(Substitution chain timed out)",
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
								storeBotReplyInHistory(
									ctx.chat.id,
									newReplyMsg.message_id,
									"(Substitution chain timed out)",
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
									{ parse_mode: "MarkdownV2" },
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
										storeBotReplyInHistory(
											ctx.chat.id,
											newReplyMsg.message_id,
											"(No match for edited pattern chain)",
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
								storeBotReplyInHistory(
									ctx.chat.id,
									newReplyMsg.message_id,
									"(No match for edited pattern chain)",
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

					// Build the final message for the edit
					let finalMessage = currentText;

					// --- TRIM TO MAX LENGTH ---
					if (finalMessage.length > MAX_MESSAGE_LENGTH) {
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
							// CRITICAL FIX: Escape the final message text for MarkdownV2 AND literal backslashes correctly
							finalMessage = escapeForMarkdownV2AndBackslashes(finalMessage);
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
							// --- NEW: Store the edited bot reply in history ---
							storeBotReplyInHistory(
								ctx.chat.id,
								previousBotReplyId, // Use the existing bot message ID
								finalMessage, // Use the new, potentially trimmed/escaped text
							);
							// --- END NEW ---
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
										// CRITICAL FIX: Escape for MarkdownV2 and backslashes
										escapeForMarkdownV2AndBackslashes(currentText),
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
									// --- NEW: Store the new bot reply in history ---
									storeBotReplyInHistory(
										ctx.chat.id,
										newReplyMsg.message_id,
										escapeForMarkdownV2AndBackslashes(currentText), // Store escaped version
									);
									// --- END NEW ---
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
								// CRITICAL FIX: Escape for MarkdownV2 and backslashes
								escapeForMarkdownV2AndBackslashes(currentText),
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
							// --- NEW: Store the new bot reply in history ---
							storeBotReplyInHistory(
								ctx.chat.id,
								newReplyMsg.message_id,
								escapeForMarkdownV2AndBackslashes(currentText), // Store escaped version
							);
							// --- END NEW ---
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
		}
	} catch (error) {
		console.error("An error occurred in the edited_message handler:", error);
	}
});

// Register the /privacy and /start commands with Telegram's UI using the CommandGroup
myCommands.setCommands(bot).catch((err) => {
	console.error("Failed to set commands with Telegram:", err);
});

bot.use(async (_, next) => {
	await next();
	cleanupOldEntries();
});

// Use runner.start
run(bot);
console.log("Bot started using runner!");
