import { Bot, Context } from "grammy";
// Import grammY runner
import { run } from "@grammyjs/runner";
// Import the commands plugin and CommandGroup
import { commands, CommandGroup, type CommandsFlavor } from "@grammyjs/commands";
import { Database } from "bun:sqlite";
import { GrammyError } from "grammy";

// --- Configuration ---
const token = process.env.TOKEN;
if (!token) {
  console.error("Error: token environment variable not set.");
  process.exit(1);
}
const base = process.env.BASE_URL || 'https://api.telegram.org';
const CLEANUP_INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

// --- Regex for sed command ---
const SED_PATTERN = /^s\/((?:\\.|[^\/])+?)\/((?:\\.|[^\/])*?)(\/.*)?$/;

// --- Type Flavouring ---
// Apply the CommandsFlavor to the Context type
type MyContext = Context & CommandsFlavor;
// Use the flavored context type for the bot
const bot = new Bot<MyContext>(token, { client: { apiRoot: base }});

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

db.run(`CREATE INDEX IF NOT EXISTS idx_bot_replies_timestamp ON bot_replies (timestamp)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_message_history_timestamp ON message_history (timestamp)`);
// --- End Database Setup ---

// --- Command Group Definition ---
const myCommands = new CommandGroup<MyContext>(); // Use the flavored context type

// Define the /privacy command using the CommandGroup
myCommands.command("privacy", "Show privacy information", async (ctx) => {
  try {
    cleanupOldEntries();
    await ctx.reply(
      "This bot does not collect or process any user data, apart from a short " +
      "backlog of messages to perform regex substitutions on. These are " +
      "stored in an in-memory sql db for 48h, and can not be accessed by the bot's " +
      "administrator in any way."
    );
  } catch (error) {
    console.error("An error occurred in the privacy command handler:", error);
  }
});

// Define the /start command using the CommandGroup and scope it to private chats
myCommands
  .command("start", "Get a greeting message (private chats only)")
  .addToScope(
    { type: "all_private_chats" },
    async (ctx) => {
      try {
        cleanupOldEntries();
        await ctx.reply("Hello! I am a regex bot. Use s/find/replace/flags to substitute text in messages.");
      } catch (error) {
        console.error("An error occurred in the start command handler:", error);
      }
    }
  );

// Register the command group with the bot
bot.use(myCommands);

// --- Helper Functions ---

function cleanupOldEntries() {
  const cutoffTime = new Date(Date.now() - CLEANUP_INTERVAL_MS).toISOString();
  const deleteHistoryStmt = db.prepare(`DELETE FROM message_history WHERE timestamp < ?`);
  const resultHistory = deleteHistoryStmt.run(cutoffTime);

  const deleteRepliesStmt = db.prepare(`DELETE FROM bot_replies WHERE timestamp < ?`);
  const resultReplies = deleteRepliesStmt.run(cutoffTime);

  if (resultHistory.changes > 0 || resultReplies.changes > 0) {
    console.log(`Cleaned up ${resultHistory.changes} old history entries and ${resultReplies.changes} old reply mappings.`);
  }
}

function storeMessageInHistory(chatId: number, messageId: number, text: string | undefined) {
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
  const existingIdsResult = selectOldIdsStmt.all(chatId) as { message_id: number }[];
  const existingIds = existingIdsResult.map(row => row.message_id);

  if (existingIds.length > 0) {
    const placeholders = existingIds.map(() => '?').join(',');
    const deleteStmt = db.prepare(
      `DELETE FROM message_history WHERE chat_id = ? AND message_id IN (${placeholders})`
    );
    deleteStmt.run(chatId, ...existingIds);
  }

  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO message_history (chat_id, message_id, text) VALUES (?, ?, ?)`
  );
  insertStmt.run(chatId, messageId, text ?? "");
}

async function findTargetMessage(ctx: MyContext, match: RegExpMatchArray, excludeMessageId?: number) {
  let targetMsgText: string | undefined;
  let targetMsgId: number | undefined;

  const messageToCheck = ctx.msg;

  if (messageToCheck?.reply_to_message) {
    targetMsgText = messageToCheck.reply_to_message.text || messageToCheck.reply_to_message.caption;
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
      const rows = selectStmt.all(...params) as { message_id: number; text: string }[];

      for (const row of rows) {
        const testText = row.text;
        const fr = match[1].replace(/\\\//g, '/');
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
  if (!flagsMatch) return '';
  return flagsMatch.substring(1).toLowerCase();
}

// Apply substitution with a timeout check
function applySubstitutionWithTimeout(text: string, match: RegExpMatchArray, timeoutMs: number = 60000): Promise<{ result: string; matched: boolean } | null> {
    return new Promise((resolve, reject) => {
        const fr = match[1].replace(/\\\//g, '/');
        const to = match[2].replace(/\\\//g, '/').replace(/\$0/g, '$&');
        const flags = getRegexFlags(match[3]);

        const globalFlag = flags.includes('g') ? 'g' : '';
        const otherFlags = flags.replace('g', '');
        const regex = new RegExp(fr, otherFlags + globalFlag);

        // Set up timeout
        const timeoutId = setTimeout(() => {
            console.log("Substitution timed out after " + timeoutMs + "ms.");
            resolve(null); // Indicate timeout/abort
        }, timeoutMs);

        try {
            // Execute the potentially slow regex
            const result = text.replace(regex, to);
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


function storeBotReplyMapping(targetMessageId: number, chatId: number, botMessageId: number) {
  const insertMapStmt = db.prepare(
    `INSERT OR REPLACE INTO bot_replies (target_message_id, chat_id, bot_message_id) VALUES (?, ?, ?)`
  );
  insertMapStmt.run(targetMessageId, chatId, botMessageId);
}

function getBotReplyMessageId(targetMessageId: number, chatId: number): number | undefined {
  const selectMapStmt = db.prepare(`
    SELECT bot_message_id FROM bot_replies
    WHERE target_message_id = ? AND chat_id = ?
  `);
  const row = selectMapStmt.get(targetMessageId, chatId) as { bot_message_id: number } | undefined;
  return row?.bot_message_id;
}

// --- Bot Handlers ---

bot.on("message", async (ctx) => {
  try {
    cleanupOldEntries();

    if (ctx.message && !ctx.message.text?.startsWith('/')) {
      storeMessageInHistory(ctx.chat.id, ctx.message.message_id, ctx.message.text || ctx.message.caption);
    }

    if (ctx.message?.text && SED_PATTERN.test(ctx.message.text)) {
      const match = ctx.message.text.match(SED_PATTERN);
      if (match) {
        const { targetMsgText, targetMsgId } = await findTargetMessage(ctx, match, undefined); // Pass MyContext and potentially excludeId if needed in future

        // Check if the target message text itself is an 's/.../.../' command
        if (targetMsgText && targetMsgId && SED_PATTERN.test(targetMsgText)) {
            console.log("Target message is an 's/.../.../' command, ignoring.");
            return; // Do nothing, don't process further
        }

        if (targetMsgText && targetMsgId) {
          const substitutionResult = await applySubstitutionWithTimeout(targetMsgText, match, 60000); // 60 second timeout

          if (substitutionResult) { // Only proceed if substitution didn't time out or fail
              const { result, matched } = substitutionResult;
              if (matched) {
              try {
                  const sentMsg = await ctx.api.sendMessage(ctx.chat.id, result, {
                  reply_parameters: { message_id: targetMsgId }
                  });
                  storeBotReplyMapping(targetMsgId, ctx.chat.id, sentMsg.message_id);
              } catch (e) {
                  console.error("Error sending reply for sed command:", e);
                  // Optionally send an error message to the user if it's not a known error like flood control
                  if (e instanceof GrammyError && e.description.includes("Flood control")) {
                      // Silently ignore flood control errors or handle them specifically
                      console.warn("Flood control hit when sending sed reply.");
                  } else {
                      // await ctx.reply("Failed to send substitution result.");
                  }
              }
              } else {
              await ctx.reply("Substitution pattern did not match.");
              }
          } else {
              await ctx.reply("Substitution took too long (timeout).");
          }
        } else {
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
    cleanupOldEntries();

    if (ctx.editedMessage?.text && SED_PATTERN.test(ctx.editedMessage.text)) {
      const match = ctx.editedMessage.text.match(SED_PATTERN);
      if (match) {
        // Pass the edited message ID to exclude it from history lookup during edits
        const { targetMsgText, targetMsgId } = await findTargetMessage(ctx, match, ctx.editedMessage.message_id);

        // Check if the target message text itself is an 's/.../.../' command
        if (targetMsgText && targetMsgId && SED_PATTERN.test(targetMsgText)) {
            console.log("Target message (during edit) is an 's/.../.../' command, ignoring.");
            return; // Do nothing, don't process further
        }

        if (targetMsgText && targetMsgId) {
          const substitutionResult = await applySubstitutionWithTimeout(targetMsgText, match, 60000); // 60 second timeout

          if (substitutionResult) { // Only proceed if substitution didn't time out or fail
              const { result, matched } = substitutionResult;

              if (matched) {
              const previousBotReplyId = getBotReplyMessageId(targetMsgId, ctx.chat.id);
              if (previousBotReplyId) {
                  try {
                  await ctx.api.editMessageText(ctx.chat.id, previousBotReplyId, result);
                  storeBotReplyMapping(targetMsgId, ctx.chat.id, previousBotReplyId);
                  console.log(`Edited bot reply ${previousBotReplyId} for target ${targetMsgId}`);
                  } catch (e) {
                  // Check for "message is not modified" error
                  if (e instanceof GrammyError && e.description.includes("message is not modified")) {
                      console.log(`Bot reply ${previousBotReplyId} for target ${targetMsgId} was not modified, ignoring.`);
                      // Do nothing, just return
                      return;
                  } else {
                      console.error("Error editing bot reply, sending new one:", e);
                      try {
                          const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, result, {
                          reply_parameters: { message_id: targetMsgId }
                          });
                          storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                      } catch (e2) {
                          console.error("Failed to send new reply after edit failed:", e2);
                      }
                  }
                  }
              } else {
                  console.warn(`No previous bot reply found for target ${targetMsgId} during edit, sending new.`);
                  try {
                  const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, result, {
                      reply_parameters: { message_id: targetMsgId }
                  });
                  storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                  } catch (e) {
                  console.error("Failed to send new reply during edit handling:", e);
                  }
              }
              } else { // No match after edit
              const previousBotReplyId = getBotReplyMessageId(targetMsgId, ctx.chat.id);
              if (previousBotReplyId) {
                  try {
                  await ctx.api.editMessageText(ctx.chat.id, previousBotReplyId, "(No match for edited pattern)");
                  storeBotReplyMapping(targetMsgId, ctx.chat.id, previousBotReplyId);
                  } catch (e) {
                  // Check for "message is not modified" error
                  if (e instanceof GrammyError && e.description.includes("message is not modified")) {
                      console.log(`Bot reply ${previousBotReplyId} (no match) for target ${targetMsgId} was not modified, ignoring.`);
                      return; // Do nothing, just return
                  } else {
                      console.error("Error editing bot reply for no-match case:", e);
                      try {
                          const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, "(No match for edited pattern)", {
                          reply_parameters: { message_id: targetMsgId }
                          });
                          storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                      } catch (e2) {
                          console.error("Failed to send new reply for no-match case:", e2);
                      }
                  }
                  }
              } else {
                  try {
                  const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, "(No match for edited pattern)", {
                      reply_parameters: { message_id: targetMsgId }
                  });
                  storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                  } catch (e) {
                  console.error("Failed to send new reply for no-match case (no previous):", e);
                  }
              }
              }
          } else { // Timeout during edit
              const previousBotReplyId = getBotReplyMessageId(targetMsgId, ctx.chat.id);
              if (previousBotReplyId) {
                  try {
                      await ctx.api.editMessageText(ctx.chat.id, previousBotReplyId, "(Substitution timed out)");
                      storeBotReplyMapping(targetMsgId, ctx.chat.id, previousBotReplyId);
                  } catch (e) {
                  // Check for "message is not modified" error
                  if (e instanceof GrammyError && e.description.includes("message is not modified")) {
                      console.log(`Bot reply ${previousBotReplyId} (timeout) for target ${targetMsgId} was not modified, ignoring.`);
                      return; // Do nothing, just return
                  } else {
                      console.error("Error editing bot reply for timeout case:", e);
                      try {
                          const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, "(Substitution timed out)", {
                              reply_parameters: { message_id: targetMsgId }
                          });
                          storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                      } catch (e2) {
                          console.error("Failed to send new reply for timeout case:", e2);
                      }
                  }
                  }
              } else {
                  try {
                      const newReplyMsg = await ctx.api.sendMessage(ctx.chat.id, "(Substitution timed out)", {
                          reply_parameters: { message_id: targetMsgId }
                      });
                      storeBotReplyMapping(targetMsgId, ctx.chat.id, newReplyMsg.message_id);
                  } catch (e) {
                      console.error("Failed to send new reply for timeout case (no previous):", e);
                  }
              }
          }
        } else {
          console.log("Edited sed command no longer finds a target message.");
        }
      }
    } else if (ctx.editedMessage) {
      storeMessageInHistory(ctx.chat.id, ctx.editedMessage.message_id, ctx.editedMessage.text || ctx.editedMessage.caption);
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

// Use runner.start instead of bot.start
run(bot)
console.log("Bot started using runner!");
// Note: The runner handles startup and connection management.
// The original `bot.start({...})` call is replaced by `run(bot, {...})`.