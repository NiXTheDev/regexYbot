# regexYbot

A fast, efficient, and feature-rich Telegram bot built with [grammY](https://github.com/grammyjs/grammy), [Bun](https://bun.sh/), and [SQLite](https://www.sqlite.org/). It provides powerful regex-based substitution (`sed` style) and matching capabilities, with automatic cleanup and robust error handling.

## Features

* **Sed-Style Substitution:** Use `s/pattern/replacement/flags` commands to perform regex substitutions on messages within the chat history or on specific replies.
* **Edit Support:** Edit your `s/.../.../` commands, and the bot will automatically update its corresponding reply with the new substitution result.
* **Target Protection:** Prevents `s/.../.../` commands from operating on other `s/.../.../` command messages, avoiding unintended behavior.
* **Runtime Safety:** Includes a configurable timeout (default 60 seconds) for regex execution to prevent hanging on potentially malicious or extremely slow patterns.
* **Opportunistic Cleanup:** Automatically removes message history and bot reply mappings older than 48 hours on every bot update for efficiency.
* **Error Resilience:** Handles Telegram API errors gracefully (e.g., "message is not modified", flood control) and avoids resending identical messages unnecessarily.
* **Fast Execution:** Leverages Bun's native SQLite driver (`bun:sqlite`) and the grammY `runner` for high-performance operation.
* **Grouping Support:** Fully supports regex capture groups (`(\w+)`) and referencing them in the replacement string using `$1`, `$2`, etc.
* **Commands Plugin:** Uses the `@grammyjs/commands` plugin for structured command handling.
* **Privacy Focused:** Stores message history and reply mappings only temporarily in an in-memory SQLite database (for 48 hours) and does not log or store user data permanently.

## Commands

* `/privacy`: Displays the bot's privacy policy.
* `s/find/replace/flags`: Performs a regex substitution. Supports flags like `g` (global), `i` (case-insensitive), `m` (multiline), `s` (DOTALL), `x` (extended).
  * **Example:** `s/old/new/gi` replaces all occurrences of "old" (case-insensitive) with "new".
  * **Example with Groups:** `s/(\w+) (\w+)/$2 $1/` swaps the first two words in a message.
* `/explain s/find/replace/flags`: Explains the components of the provided `s/.../.../` command.

## Environment Variables

* `TOKEN`: Your Telegram bot token (required).
* `BASE_URL`[Optional]: Base url for telegram bot api, if you're running a local server

## Setup & Run

1. Ensure you have [Bun](https://bun.sh/) installed.
2. Clone this repository.
3. Install dependencies (if any listed in `package.json`) using `bun install`.
4. Set your Telegram bot token in an environment variable named `TOKEN`.
5. Run the bot using `bun run index.ts` (assuming your main file is `index.ts`).

## Tech Stack

* **grammY:** Telegram Bot Framework
* **@grammyjs/runner:** Concurrent Update Processing
* **@grammyjs/commands:** Command Handling
* **Bun:** JavaScript Runtime
* **bun:sqlite:** Native SQLite Driver

## License

[MIT](LICENSE)
