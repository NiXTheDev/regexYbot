# regexYbot

A fast, efficient, and feature-rich Telegram bot built with [grammY](https://github.com/grammyjs/grammy), [Bun](https://bun.sh/), and [SQLite](https://www.sqlite.org/). It provides powerful regex-based substitution (`sed` style) with a focus on performance, scalability, and robust error handling.

## Features

* **Sed-Style Substitution:** Use `s/pattern/replacement/flags` commands to perform regex substitutions on messages within the chat history or on specific replies.
* **Edit Support:** Edit your `s/.../.../` commands, and the bot will automatically update its corresponding reply with the new substitution result.
* **High-Performance Worker Pool:** Regex operations are offloaded to a pool of [Bun Worker](https://bun.sh/docs/api/workers) threads, ensuring the bot remains responsive even under heavy load or with complex patterns.
* **Performance Timing:** Use the `p` flag (e.g., `s/pattern/repl/p`) to measure and display the execution time of the substitution chain.
* **Configurable Logging:** Features a custom, module-based logger with configurable levels (`none`, `debug`, `info`, `warn`, `error`, `fatal`) and a customizable output template.
* **Target Protection:** Prevents `s/.../.../` commands from operating on other `s/.../.../` command messages, avoiding unintended behavior.
* **Runtime Safety:** Includes a configurable timeout (default 60 seconds) for regex execution to prevent hanging on potentially malicious or extremely slow patterns.
* **Opportunistic Cleanup:** Automatically removes message history and bot reply mappings older than 48 hours on every bot update for efficiency.
* **Error Resilience:** Handles Telegram API errors gracefully (e.g., "message is not modified", flood control) and avoids resending identical messages unnecessarily.
* **Grouping Support:** Fully supports regex capture groups (`(\w+)`) and referencing them in the replacement string using `$1`, `$2`, etc.

## Commands

* `/start`: Get a greeting message and a brief guide on how to use the bot.
* `/privacy`: Displays the bot's privacy policy.
* `s/find/replace/flags`: Performs a regex substitution.
  * **Example:** `s/old/new/gi` replaces all occurrences of "old" (case-insensitive) with "new".
  * **Example with Groups:** `s/(\w+) (\w+)/$2 $1/` swaps the first two words in a message.
  * **Example with Performance:** `s/complex_pattern/replacement/gip` performs a global, case-insensitive substitution and prints the execution time.

## Environment Variables

Configure the bot's behavior with the following environment variables:

* `TOKEN`: Your Telegram bot token (required).
* `BASE_URL` (Optional): Base URL for the Telegram Bot API, useful for local testing.
* `LOG_LEVEL` (Optional): Sets the minimum log level. Defaults to `debug` in development and `info` in production.
  * **Available levels:** `none`, `debug`, `info`, `warn`, `error`, `fatal`.
* `LOG_TEMPLATE` (Optional): Customizes the log output format. Defaults to `[{level}: {module}]: {message}`.
* `NODE_ENV` (Optional): Set to `production` to default the log level to `info`.
* `WORKER_POOL_SIZE` (Optional): Sets the number of worker threads for regex processing. Defaults to `4`.

## Setup & Run

1.  Ensure you have [Bun](https://bun.sh/) installed.
2.  Clone this repository.
3.  Set your Telegram bot token in an environment variable:
    ```bash
    export TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
    ```
4.  Run the bot from the project's root directory:
    ```bash
    bun index.ts
    ```

## Project Structure

The project is organized into several modules for clarity and maintainability:

* `index.ts`: The main application entry point, handling Telegram bot logic.
* `hellspawn.ts`: The worker script that performs the actual regex substitution.
* `logger.ts`: A custom, configurable logging utility.
* `types.ts`: Contains shared TypeScript types and interfaces.
* `utils.ts`: Houses shared helper functions.

## Tech Stack

* **grammY:** Modern Telegram Bot Framework.
* **@grammyjs/runner:** For concurrent update processing.
* **@grammyjs/commands:** For structured command handling.
* **Bun:** High-performance JavaScript runtime.
* **bun:sqlite:** Native, fast SQLite driver.
* **Bun Worker API:** For parallel, non-blocking regex execution.

## License

[MIT](LICENSE)