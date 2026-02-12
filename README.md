# regexYbot

A fast, efficient, and feature-rich Telegram bot built with [grammY](https://github.com/grammyjs/grammy), [Bun](https://bun.sh/), and [SQLite](https://www.sqlite.org/). It provides powerful regex-based substitution (`sed` style) with a focus on performance, scalability, and robust error handling.

## Features

- **Sed-Style Substitution:** Use `s/pattern/replacement/flags` commands to perform regex substitutions on messages within the chat history or on specific replies.
- **Edit Support:** Edit your `s/.../.../` commands, and the bot will automatically update its corresponding reply with the new substitution result.
- **High-Performance Worker Pool:** Regex operations are offloaded to a pool of [Bun Worker](https://bun.sh/docs/api/workers) threads, ensuring the bot remains responsive even under heavy load or with complex patterns.
- **Performance Timing:** Use the `p` flag (e.g., `s/pattern/repl/p`) to measure and display the execution time of the substitution chain.
- **Configurable Logging:** Features a custom, module-based logger with configurable levels (`none`, `debug`, `info`, `warn`, `error`, `fatal`) and a customizable output template.
- **Target Protection:** Prevents `s/.../.../` commands from operating on other `s/.../.../` command messages, avoiding unintended behavior.
- **Runtime Safety:** Includes a configurable timeout (default 60 seconds) for regex execution to prevent hanging on potentially malicious or extremely slow patterns.
- **Opportunistic Cleanup:** Automatically removes message history and bot reply mappings older than 48 hours on every bot update for efficiency.
- **Error Resilience:** Handles Telegram API errors gracefully (e.g., "message is not modified", flood control) and avoids resending identical messages unnecessarily.
- **Grouping Support:** Fully supports regex capture groups (`(\w+)`) and referencing them in the replacement string using `$1`(modern way), or `\1`(old regexbot, legacy way), with support for mixed syntax

## Commands

- `/start`: Get a greeting message and a brief guide on how to use the bot.
- `/privacy`: Displays the bot's privacy policy.
- `s/find/replace/flags`: Performs a regex substitution.
  - **Example:** `s/old/new/gi` replaces all occurrences of "old" (case-insensitive) with "new".
  - **Example with Groups:** `s/(\w+) (\w+)/$2 $1/`(modern way), or `s/(\w+) (\w+)/\2 \1/`(old regexbot, legacy way) swaps the first two words in a message, regexy supports both modes at the same time, mixing(`/$2 \1/`) is supported too.
  - **Example with Performance:** `s/complex_pattern/replacement/gip` performs a global, case-insensitive substitution and prints the execution time.

## Environment Variables

Configure the bot's behavior with the following environment variables:

| Variable                    | Required | Description                                                                                               | Default Value                                |
| :-------------------------- | :------: | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| `TOKEN`                     | **Yes**  | Your Telegram bot token.                                                                                  | —                                            |
| `BASE_URL`                  |    No    | Base URL for the Telegram Bot API, useful for local testing.                                              | `https://api.telegram.org`                   |
| `LOG_LEVEL`                 |    No    | Sets the minimum log level. <br>**Available levels:** `none`, `debug`, `info`, `warn`, `error`, `fatal`.  | `debug` (development)<br>`info` (production) |
| `LOG_TEMPLATE`              |    No    | Customizes the log output format.                                                                         | `[{level}: {module}]: {message}`             |
| `NODE_ENV`                  |    No    | Set to `production` to default the log level to `info`.                                                   | —                                            |
| `WORKER_POOL_SIZE`          |    No    | Sets the number of worker threads for regex processing.                                                   | 4                                            |
| `WORKER_TIMEOUT_MS`         |    No    | Maximum time a regex operation can run before being terminated (milliseconds).                            | 60000                                        |
| `GRACEFUL_DRAIN`            |    No    | Enable graceful drain on shutdown. Processes pending tasks instead of rejecting them.                     | `false`                                      |
| `GRACEFUL_DRAIN_TIMEOUT_MS` |    No    | Maximum time to spend draining queue during shutdown (milliseconds). Max 9500ms for Docker compatibility. | 8000                                         |
| `MAX_CHAIN_LENGTH`          |    No    | Maximum number of sed commands that can be chained together.                                              | 5                                            |
| `MAX_MESSAGE_LENGTH`        |    No    | Maximum length of the bot's response message.                                                             | 4096                                         |
| `CLEANUP_INTERVAL_MS`       |    No    | How often to clean up old message history (milliseconds).                                                 | 172800000 (48 hours)                         |
| `MAX_HISTORY_PER_CHAT`      |    No    | Maximum number of messages to keep in history per chat.                                                   | 20                                           |
| `HISTORY_QUERY_LIMIT`       |    No    | Maximum number of messages to search when finding a target.                                               | 10                                           |
| `RETRY_MAX_RETRIES`         |    No    | Maximum number of retries for Telegram API calls.                                                         | 3                                            |
| `RETRY_MAX_DELAY_MS`        |    No    | Maximum delay between retries for Telegram API calls (milliseconds).                                      | 30000                                        |
| `ENABLE_FILE_HEALTHCHECK`   |    No    | Enable file-based healthcheck for Docker environments.                                                    | `false`                                      |
| `LIVENESS_FILE`             |    No    | Path to the liveness file when healthcheck is enabled.                                                    | `/tmp/bot-alive`                             |
| `LIVENESS_INTERVAL_MS`      |    No    | How often to update the liveness file (milliseconds).                                                     | 30000                                        |

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

## Data Persistence

**Important:** This bot uses an **in-memory SQLite database** (`sqlite://:memory:`) by default. This means:

- **All message history and reply mappings are ephemeral** - they are lost when the bot restarts
- The retention window (48 hours by default) is designed to support Telegram's edit window and reply-less sed behavior
- No persistent storage is required or used
- For production deployments, this design is intentional - the bot does not store any data permanently

If you need persistent storage (not recommended for this use case), you would need to modify `index.ts` to use a file-based SQLite database instead.

## Project Structure

The project is organized into several modules for clarity and maintainability:

- `index.ts`: The main application entry point and bot wiring. Thin composition root that orchestrates other modules.
- `config.ts`: Centralized configuration with typed env var loading and validation.
- `database.ts`: Database service layer with `DatabaseService` class for message history and reply tracking.
- `workerPool.ts`: Worker pool management for concurrent regex processing.
- `sed.ts`: Sed command parsing and handling logic (`parseSedCommands`, `SedHandler`).
- `hellspawn.ts`: The worker script that performs the actual regex substitution in separate threads.
- `logger.ts`: A custom, configurable logging utility.
- `types.ts`: Contains shared TypeScript types and interfaces.
- `utils.ts`: Houses shared helper functions (regex patterns, escaping, flag normalization).

## Tech Stack

- **[grammY](https://grammy.dev):** Modern Telegram Bot Framework.
- **[@grammyjs/runner](https://grammy.dev/plugins/runner.html):** For concurrent update processing.
- **[@grammyjs/commands](https://grammy.dev/plugins/commands.html):** For structured command handling.
- **[Bun](https://bun.sh/):** High-performance JavaScript runtime.
- **[bun:sqlite](https://bun.sh/docs/api/sqlite):** Bun's native, fast SQLite driver.
- **[Bun Worker API](https://bun.sh/docs/api/worker):** For parallel, non-blocking regex execution.

## Branching Strategy & Releases

This project uses a two-branch workflow:

### `main` branch (Stable)

- Contains production-ready code
- Merges happen from `dev` via pull requests
- Docker images are tagged with:
  - `release` - stable release marker
  - `latest` - floats to most recent build (becomes stable after merge)
  - Version numbers from `package.json` (e.g., `0.1.7.1`, `0.1.7`, `0.1`)
  - Git commit hash

### `dev` branch (Development)

- Active development happens here
- Feature branches merge into `dev`
- Docker images are tagged with:
  - `dev` - latest development build
  - `next` - upcoming release preview
  - `latest` - floats to most recent build (overwritten by dev activity)
  - `dev-<version>` - version-specific dev build (e.g., `dev-0.1.7.1`)

### Workflow

1. Create feature branches from `dev`
2. Open PRs targeting `dev`
3. When ready for release, open PR from `dev` to `main`
4. After merging to `main`, Docker images are built with release tags

## Docker Deployment

### Graceful Shutdown

The bot supports graceful shutdown for Docker deployments:

**Default Behavior (Immediate Shutdown):**

- On SIGTERM/SIGINT, immediately stops accepting updates
- Queued tasks are rejected
- Fast shutdown suitable for most use cases

**Graceful Drain Mode (Optional):**
Enable with `GRACEFUL_DRAIN=true` to process pending tasks before shutting down:

```yaml
environment:
  - GRACEFUL_DRAIN=true
  - GRACEFUL_DRAIN_TIMEOUT_MS=8000
```

**Important considerations:**

- Graceful drain must complete within Docker's stop grace period (default: 10s)
- Default drain timeout is 8000ms (8s) to fit within Docker's grace period
- Maximum recommended: 9500ms (9.5s) to avoid SIGKILL
- If queue is too large to drain in time, remaining tasks are lost
- Useful for deployments where you don't want to lose pending operations

**Adjusting Docker Grace Period:**
If you need more time for graceful drain, increase the container's grace period:

```yaml
services:
  regexybot:
    stop_grace_period: 20s # Increase from default 10s
    environment:
      - GRACEFUL_DRAIN=true
      - GRACEFUL_DRAIN_TIMEOUT_MS=18000 # 18s (under 20s grace period)
```

### Testing Graceful Shutdown

A test script is provided to verify graceful shutdown behavior:

```bash
cd docker
./test-graceful-shutdown.sh
```

This tests:

- Immediate shutdown behavior
- Graceful drain with pending tasks
- Docker Compose stop/restart scenarios
- SIGINT vs SIGTERM handling

## License

[MIT](LICENSE)
