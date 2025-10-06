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
const DEFAULT_SUBSTITUTION_TIMEOUT_MS = 60000; // 60 seconds default timeout

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
				"Hello! I am a regex bot. Use s/find/replace/flags to substitute text in messages. You can chain multiple commands, one per line.\n\n" +
					"Special flags:\n" +
					"- `p`: Show performance timing (e.g., `s/pattern/repl/p`)\n" +
					"Use `\\N` in replacements for captured groups (e.g., `\\1`).",
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
				const regex = new RegExp(fr, getRegexFlags(match[3]).flags); // Use processed flags
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

// Modify getRegexFlags to also return the original flags string for checking custom flags like 'p'
function getRegexFlags(flagsMatch: string | undefined): {
	flags: string;
	originalFlags: string | undefined;
} {
	if (!flagsMatch) return { flags: "", originalFlags: undefined };

	// The original flags string including the leading '/', e.g., "/pgi"
	const originalFlags = flagsMatch;
	// Extract the part after the leading '/', e.g., "pgi"
	const rawFlags = flagsMatch.substring(1);

	// Define standard JavaScript RegExp flags
	const standardFlagChars = ["g", "i", "m", "s", "u", "y"]; // As per JS RegExp spec

	// Filter the raw flags to include only standard JS flags, make them lowercase, deduplicate, sort (optional for consistency)
	// Using a Set ensures uniqueness, Array.from + filter ensures only standard flags, sort for consistency, join.
	const standardFlagsArray = Array.from(new Set(rawFlags))
		.filter((char) => standardFlagChars.includes(char.toLowerCase()))
		.map((char) => char.toLowerCase())
		.sort(); // Sorting is optional but ensures consistent order like "gi"

	// Join the filtered standard flags into a string for the RegExp constructor
	const flags = standardFlagsArray.join("");

	return { flags, originalFlags }; // Return both standard flags and the original string
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
	// Standard MarkdownV2 special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
	escapedText = escapedText.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");

	return escapedText;
}
// --- END CORRECTED ESCAPING FUNCTION ---

// Apply substitution using Bun.spawn with a real timeout and optional performance measurement
async function applySubstitutionWithTimeout(
	text: string,
	match: RegExpMatchArray,
	timeoutMs: number = DEFAULT_SUBSTITUTION_TIMEOUT_MS,
): Promise<{
	result: string;
	matched: boolean;
	performanceInfo?: string;
} | null> {
	// --- Process the 'from' (pattern) and 'to' (replacement) parts ---
	const fr = match[1].replace(/\\\//g, "/"); // Clean the 'from' pattern
	let rawTo = match[2].replace(/\\\//g, "/"); // Clean the 'to' part
	// Convert user's \N syntax to JS's $N syntax for the replacement string
	const processedTo = rawTo.replace(/\\(\d+)/g, "$$$1"); // Convert \N to $N
	const { flags, originalFlags } = getRegexFlags(match[3]); // Get both standard and original flags
	// --- End processing of parts ---

	// --- Check for Performance Flag ---
	const includePerformance = originalFlags?.toLowerCase().includes("p");
	let startTime: number | undefined;
	// --- End Performance Flag Check ---

	try {
		// Record start time if performance flag is set
		if (includePerformance) {
			startTime = performance.now(); // Get high-resolution timestamp
		}

		// --- Spawn the subprocess to perform the regex WITH TIMEOUT OPTIONS ---
		// Use Bun.file() or relative path "./perform_regex.ts" if needed, or absolute path
		const proc = Bun.spawn({
			cmd: [
				"bun", // Command to run Bun
				"./hellspawn.ts", // Path to the script (adjust if needed, e.g., "./hellspawn")
				text, // Pass the target text as argument 1
				fr, // Pass the cleaned pattern as argument 2
				flags, // Pass the processed standard flags (e.g., 'gi') as argument 3
				processedTo, // Pass the *processed* replacement string as argument 4
			],
			// Set the timeout and kill signal directly in spawn options
			timeout: timeoutMs, // Milliseconds before the process is killed
			killSignal: "SIGKILL", // Signal to send to kill the process (SIGTERM is default)
			stdin: "ignore", // We are not sending anything to stdin
			stdout: "pipe", // We need to read the output
			stderr: "pipe", // We need to read errors
		});
		// --- End spawning subprocess with timeout ---

		// Wait for the subprocess to exit (either naturally or due to timeout/kill)
		const exitCode = await proc.exited;

		// Calculate duration if performance flag was set
		let durationMs: number | undefined;
		if (includePerformance && startTime !== undefined) {
			const endTime = performance.now();
			durationMs = endTime - startTime;
		}

		if (exitCode === 0) {
			// Process finished successfully
			const rawOutput = await new Response(proc.stdout).text();
			const result = rawOutput.trimEnd(); // Get output and remove trailing newline

			// Determine if a match occurred by comparing input and output
			const matched = result !== text;

			// Prepare the resolution object
			const resolution: {
				result: string;
				matched: boolean;
				performanceInfo?: string;
			} = { result, matched };

			// Add performance info if requested and measured
			if (includePerformance && durationMs !== undefined) {
				resolution.performanceInfo = ` (⏱️ ${durationMs.toFixed(2)}ms)`;
			}

			return resolution; // Resolve with the successful result
		} else {
			// Process failed or was killed due to timeout/options
			const rawStderr = await new Response(proc.stderr).text();
			const stderr = rawStderr.trim();
			if (stderr) {
				console.error(`Subprocess error for /${fr}/${flags}: ${stderr}`);
			} else {
				// If killed by timeout, stderr might be empty.
				// The exit code might be non-zero (e.g., 124 for timeout in some systems, or the signal code).
				// Bun might expose the signal via proc.killed or similar, but checking exitCode is standard.
				console.error(
					`Subprocess for /${fr}/${flags} exited with code ${exitCode} (likely timed out/killed). No stderr.`,
				);
			}

			// Resolve with null to indicate failure/timeout
			return null;
		}
	} catch (error) {
		// Catch errors related to spawning the process itself (e.g., script not found)
		console.error("Unexpected error spawning subprocess for regex:", error);
		// Reject the promise if there's an unexpected error in the spawning logic
		throw error; // Or return null if you prefer to handle spawn errors as "failures" rather than exceptions
	}
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
					// Modify allResults type to include performanceInfo
					let allResults: {
						pattern: string;
						result: string;
						matched: boolean;
						performanceInfo?: string;
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
							DEFAULT_SUBSTITUTION_TIMEOUT_MS, // 60 second timeout per command
						);

						if (substitutionResult === null) {
							chainTimedOut = true;
							break; // Stop processing the chain
						}

						const { result, matched, performanceInfo } = substitutionResult; // Destructure performanceInfo
						// Include performanceInfo in allResults
						allResults.push({
							pattern: cmdLine,
							result,
							matched,
							performanceInfo,
						});
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

					// --- Check for Performance Info and Append ---
					// Check if *any* command in the chain used the 'p' flag
					const hasPerformanceFlag = allResults.some((r) => r.performanceInfo);
					if (hasPerformanceFlag) {
						// Collect performance info strings from commands that had it
						const perfInfos = allResults
							.filter((r) => r.performanceInfo)
							.map((r) => r.performanceInfo)
							.join(""); // Join them, e.g., " (⏱️ 10.23ms) (⏱️ 5.11ms)"

						// Append the collected performance info to the final message
						// Ensure we don't exceed MAX_MESSAGE_LENGTH even after appending perf info
						const potentialFinalMessage = finalMessage + perfInfos;
						if (potentialFinalMessage.length <= MAX_MESSAGE_LENGTH) {
							finalMessage = potentialFinalMessage;
						} else {
							// If adding perf info makes it too long, truncate the main result slightly more
							// and then append what fits of the perf info, or just append a generic note.
							// Simple approach: truncate main result and add a short note
							finalMessage =
								finalMessage.slice(0, MAX_MESSAGE_LENGTH - 50) +
								"... (⏱️ +info)";
							// Or, more complex: try to fit some perf info
							// const truncatedMain = finalMessage.slice(0, MAX_MESSAGE_LENGTH - perfInfos.length);
							// finalMessage = truncatedMain + perfInfos;
						}
					}
					// --- End Performance Info Append ---

					// Send the final formatted message
					// Note: Using parse_mode: "MarkdownV2" for potential markdown chars in the final result
					// Escape the final message text before sending.
					finalMessage = escapeForMarkdownV2AndBackslashes(finalMessage); // Use the corrected escaping function
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
		// Optionally notify the user, but be careful not to cause an infinite loop
		// if the error itself is related to sending messages.
		// For now, just log it.
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
					// Modify allResults type to include performanceInfo
					let allResults: {
						pattern: string;
						result: string;
						matched: boolean;
						performanceInfo?: string;
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
							DEFAULT_SUBSTITUTION_TIMEOUT_MS,
						);

						if (substitutionResult === null) {
							chainTimedOut = true;
							break;
						}

						const { result, matched, performanceInfo } = substitutionResult; // Destructure performanceInfo
						// Include performanceInfo in allResults
						allResults.push({
							pattern: cmdLine,
							result,
							matched,
							performanceInfo,
						});
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
								// --- NEW: Store the bot's sent reply in history ---
								storeBotReplyInHistory(
									ctx.chat.id,
									previousBotReplyId,
									"(Substitution chain timed out)",
								);
								// --- END NEW ---
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
										// --- NEW: Store the new bot reply in history ---
										storeBotReplyInHistory(
											ctx.chat.id,
											newReplyMsg.message_id,
											"(Substitution chain timed out)",
										);
										// --- END NEW ---
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
								// --- NEW: Store the new bot reply in history ---
								storeBotReplyInHistory(
									ctx.chat.id,
									newReplyMsg.message_id,
									"(Substitution chain timed out)",
								);
								// --- END NEW ---
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
								// --- NEW: Store the bot's sent reply in history ---
								storeBotReplyInHistory(
									ctx.chat.id,
									previousBotReplyId,
									"(No match for edited pattern chain)",
								);
								// --- END NEW ---
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
										// --- NEW: Store the new bot reply in history ---
										storeBotReplyInHistory(
											ctx.chat.id,
											newReplyMsg.message_id,
											"(No match for edited pattern chain)",
										);
										// --- END NEW ---
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
								// --- NEW: Store the new bot reply in history ---
								storeBotReplyInHistory(
									ctx.chat.id,
									newReplyMsg.message_id,
									"(No match for edited pattern chain)",
								);
								// --- END NEW ---
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

					// --- Check for Performance Info and Append (EDIT HANDLER) ---
					// Check if *any* command in the chain used the 'p' flag
					const hasPerformanceFlag = allResults.some((r) => r.performanceInfo);
					if (hasPerformanceFlag) {
						// Collect performance info strings from commands that had it
						const perfInfos = allResults
							.filter((r) => r.performanceInfo)
							.map((r) => r.performanceInfo)
							.join(""); // Join them, e.g., " (⏱️ 10.23ms) (⏱️ 5.11ms)"

						// Append the collected performance info to the final message
						// Ensure we don't exceed MAX_MESSAGE_LENGTH even after appending perf info
						const potentialFinalMessage = finalMessage + perfInfos;
						if (potentialFinalMessage.length <= MAX_MESSAGE_LENGTH) {
							finalMessage = potentialFinalMessage;
						} else {
							// If adding perf info makes it too long, truncate the main result slightly more
							// and then append what fits of the perf info, or just append a generic note.
							// Simple approach:
							finalMessage =
								finalMessage.slice(0, MAX_MESSAGE_LENGTH - 50) +
								"... (⏱️ +info)";
							// Or, more complex: try to fit some perf info
							// const truncatedMain = finalMessage.slice(0, MAX_MESSAGE_LENGTH - perfInfos.length);
							// finalMessage = truncatedMain + perfInfos;
						}
					}
					// --- End Performance Info Append (EDIT HANDLER) ---

					// --- Handle editing or sending the new message ---
					const previousBotReplyId = getBotReplyMessageId(
						targetMsgId,
						ctx.chat.id,
					);
					if (previousBotReplyId) {
						try {
							// Edit the message, ensuring parse_mode is MarkdownV2
							// Escape the final message text before sending.
							finalMessage = escapeForMarkdownV2AndBackslashes(finalMessage); // Use the corrected escaping function
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
										// Escape the final message text before sending.
										escapeForMarkdownV2AndBackslashes(finalMessage), // Use the corrected escaping function
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
										escapeForMarkdownV2AndBackslashes(finalMessage), // Use the potentially trimmed/escaped text
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
								// Escape the final message text before sending.
								escapeForMarkdownV2AndBackslashes(finalMessage), // Use the corrected escaping function
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
								escapeForMarkdownV2AndBackslashes(finalMessage), // Use the potentially trimmed/escaped text
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
