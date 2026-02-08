# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Tooling & Commands

### Environment & Dependencies

- Runtime: [Bun](https://bun.sh/) (CI and Docker use Bun 1.3.8).
- Install dependencies:

```bash
bun install
```

- Local env file (instead of setting every variable manually):

```bash
cp .env.example .env
# Edit .env and set at least TOKEN
```

Key environment variables (see `README.md`, `.env.example`, and `docker/README.md`):

- `TOKEN` (required): Telegram bot token.
- `BASE_URL` (optional): Custom Telegram Bot API base URL.
- `LOG_LEVEL`, `LOG_TEMPLATE`, `NODE_ENV`: control logging behavior.
- `WORKER_POOL_SIZE`: number of Bun worker threads for regex processing.
- `ENABLE_FILE_HEALTHCHECK`, `LIVENESS_FILE`, `LIVENESS_INTERVAL_MS`: enable and configure file-based healthcheck when running under Docker.

### Running the bot locally

- Development mode with file watching (preferred for local work):

```bash
bun run dev
```

- One-off run of the bot entrypoint:

```bash
bun run index.ts
# or equivalently, using the script alias
bun run main
```

### Tests

- Run the full Bun test suite (used by CI):

```bash
bun test
```

- Run tests in watch mode (from `CONTRIBUTING.md`):

```bash
bun test --watch
```

- Run a single test file (Bun test runner behavior):

```bash
bun test utils.test.ts
# or any specific *.test.ts file
```

### Linting & Formatting

- Lint the codebase (same as CI workflows):

```bash
bun run lint
```

- Format the codebase with Prettier:

```bash
bun run format
```

- Check formatting without writing changes (used in CI):

```bash
bun run format:check
```

### Type Checking

- Run TypeScript type checking (no emit):

```bash
bun run typecheck
```

### Aggregated local checks

- Full local quality gate including tests (from `package.json`):

```bash
bun run ltf
# expands to: bun lint && bun typecheck && bun fmt && bun test ./tests/*.test.ts
```

- Faster, non-mutating check (no `bun test`, formatting is check-only):

```bash
bun run ltf:check
# expands to: bun run lint && bun run typecheck && bun run format:check
```

### Docker & Docker Compose

- Build the production Docker image defined by `Dockerfile`:

```bash
docker build -t regexybot .
```

- Run using the provided `docker-compose.yml` (image defaults to GHCR release, expects `TOKEN` in the environment):

```bash
cd docker
docker compose up -d
```

Healthcheck behavior and the optional file-based liveness probe are documented in `docker/README.md` and wired through `index.ts` via `ENABLE_FILE_HEALTHCHECK`/`LIVENESS_FILE`/`LIVENESS_INTERVAL_MS`.

## Architecture Overview

### Big-picture flow

- **Telegram → grammY → Bot logic → Worker pool → Telegram**
  - Incoming updates are handled by a grammY `Bot` in `index.ts` (thin composition root) with the `@grammyjs/commands` plugin and `@grammyjs/runner` to process updates concurrently.
  - The bot listens to `message` and `edited_message` updates and routes both through `handleTextMessage`.
  - `handleTextMessage` stores non-command messages in an in-memory SQLite history via `DatabaseService`, then looks for sed-style commands (`s/pattern/replacement/flags`).
  - For valid sed commands, it uses `DatabaseService` to locate the target message (reply target or recent history), then delegates to `SedHandler` which orchestrates the substitution chain using `WorkerPool` backed by `hellspawn.ts` worker threads.
  - Results are escaped for Telegram MarkdownV2 and sent back either as a new reply or by editing a previous bot reply, tracked via `bot_replies` in the SQLite database.

### Data & persistence

- **Database layer (in-memory SQLite via Bun SQL):**
  - `index.ts` creates an in-memory SQLite database (`sqlite://:memory:`) with two tables:
    - `message_history(chat_id, message_id, text, timestamp)` – stores a bounded backlog of recent messages per chat.
    - `bot_replies(target_message_id, chat_id, bot_message_id, timestamp)` – maps original messages to the bot's reply message IDs.
  - **All data is ephemeral** – the in-memory database resets on every process restart. The retention window (48 hours by default) is intended only to support Telegram's edit window and reply-less sed behavior.
  - `DatabaseService` (defined in `database.ts`) encapsulates:
    - `storeMessageInHistory` / `storeBotReplyInHistory`: insert or replace messages and bot replies, while enforcing `MAX_HISTORY_PER_CHAT` from `CONFIG`.
    - `findTargetMessage`: given a sed command and context, searches the reply target or recent history (`HISTORY_QUERY_LIMIT`) for the first message whose text matches the regex.
    - `storeBotReplyMapping` / `getBotReplyMessageId`: track and retrieve which bot message replied to which original message, used for edits.
    - `cleanupOldEntries`: opportunistic cleanup run after each update that deletes history and reply mappings older than `CLEANUP_INTERVAL_MS`.
    - Helper methods for testing: `findMessagesInHistory`, `findRepliesInHistory`, `deleteAllMessages`, `deleteAllReplies`.

### Sed command parsing & execution

- **Parsing:**
  - `utils.ts` defines a single, central `SED_PATTERN` regex that recognizes sed commands with escaped slashes and optional flags.
  - `index.ts` contains `parseSedCommands`, which splits multi-line input into one or more `s/.../.../flags` commands, preserving multi-line replacements.
- **Flags & replacements:**
  - `getRegexFlags` in `utils.ts` normalizes flags: deduplicates, lowercases, filters to safe JavaScript regex flags (`gimsyu`), and preserves the original flag string (for detecting the custom `p` performance flag).
  - `handleSedCommand` in `sed.ts` (via `SedHandler` class):
    - Enforces `MAX_CHAIN_LENGTH` from `CONFIG` to bound how many chained commands are applied.
    - Normalizes patterns and replacements (unescapes `\/`, converts `\1`-style capture group references into JavaScript replacement syntax, expands `\n`/\t`).
    - Determines whether performance timing should be included based on the `p` flag in any command.

### Worker pool & concurrency

- **Main-thread worker pool (`WorkerPool` in `workerPool.ts`):**
  - Lazily initialized with `WORKER_POOL_SIZE` workers, all running `hellspawn.ts`.
  - Maintains a queue of `TaskMessage`s and a `pendingTasks` map from `Worker` → `{resolve, reject}`.
  - `run(task)` enqueues work and ensures only idle workers are assigned new tasks.
  - Each task is guarded by a timeout (`WORKER_TIMEOUT_MS`): on timeout, the worker is terminated, the promise rejects with a user-facing timeout error, and the worker is replaced.
  - On successful completion, `handleWorkerMessage` resolves the corresponding promise, clears the timeout, and processes the next queued task.
  - `shutdown()` method for graceful shutdown: rejects queued tasks, terminates all workers, and clears resources.

- **Worker implementation (`hellspawn.ts`):**
  - Listens for `TaskMessage`s from the main thread, logs the number of commands, and applies a single `SedCommand` (the main thread enforces one-command-per-task).
  - Uses `performance.now()` to compute `performanceMs` when requested.
  - Returns `ResultMessage` objects with `result`, optional `performanceMs`, and `error` if an exception was thrown when constructing or applying the regex.

- **Testing model for concurrency:**
  - `workerpool.test.ts` reimplements a `MockWorkerPool` in-process (no real `Worker` threads) to validate queueing, concurrency limits, and behavior under multiple tasks.
  - This decouples the concurrency logic from the Bun worker runtime while still using the same `TaskMessage`/`ResultMessage` structures from `types.ts`.

### Logging & configuration

- **Logging (`logger.ts`, `types.ts`):**
  - `LogLevel` and `LOG_LEVELS` define numeric severity ordering.
  - `Logger` reads global configuration from env (`LOG_LEVEL`, `NODE_ENV`, `LOG_TEMPLATE`) and formats messages as `[{level}: {module}]: {message}` by default.
  - All major components (`index.ts` main flow, worker pool, `hellspawn.ts`, initialization paths) use a `Logger` instance with a module name, which is crucial for debugging worker timeouts, DB cleanup, and sed parsing.

- **Configuration (`config.ts`):**
  - Typed configuration loader that reads and validates environment variables.
  - Supports 17+ configuration options with sensible defaults and min/max bounds validation.
  - Helper functions for parsing integers, booleans, strings, and log levels with validation.
  - Frozen `CONFIG` object export prevents accidental mutations.
  - Test mode support - skips TOKEN validation when `NODE_ENV=test`.
  - Tests such as `database.test.ts` import `CONFIG` for assertions; when changing limits like `MAX_HISTORY_PER_CHAT`, adjust tests accordingly.

### Telegram integration & commands

- **grammY bot wiring (`index.ts`):**
  - Bot initialization uses `TOKEN` and optional `BASE_URL` (for self-hosted Telegram API instances).
  - `@grammyjs/auto-retry` is applied with retry limits from `CONFIG` to automatically recover from transient Telegram errors (e.g., rate limits).
  - `CommandGroup` from `@grammyjs/commands` is used to register `/start` and `/privacy` commands with Telegram via `setCommands`.

- **Message handling:**
  - `bot.on("message", ...)` and `bot.on("edited_message", ...)` both delegate into `handleTextMessage`, passing a flag to indicate whether this is an edit.
  - `sendOrEditReply` encapsulates the logic for updating previous bot replies when a user edits the original sed command:
    - Attempts `editMessageText` against the stored bot reply ID.
    - Handles "message is not modified" gracefully by ignoring the edit.
    - Falls back to sending a new message if editing fails for other reasons, while keeping the `bot_replies` mapping up to date.

### Healthchecks & liveness

- **In-process liveness:**
  - When `ENABLE_FILE_HEALTHCHECK=true`, `index.ts` writes a timestamp to `LIVENESS_FILE` (default `/tmp/bot-alive`) every `LIVENESS_INTERVAL_MS` milliseconds.
  - This integrates with the file-based healthcheck option in `docker/docker-compose.yml` and `docker/README.md` to detect event-loop deadlocks.

- **CI and security tooling:**
  - GitHub workflows (`.github/workflows/*.yml`) define the canonical check sequence: lint → format:check → typecheck → test → Docker build.
  - Dependabot is configured via `.github/dependabot.yml` to keep Bun dependencies and tooling up to date.

## Testing Strategy

- **Test runner:** uses Bun's built-in `bun:test` module; tests live in `tests/*.test.ts` files (`database.test.ts`, `sed.test.ts`, `utils.test.ts`, `workerpool.test.ts`).
- **Focus areas:**
  - `utils.test.ts`: ensures sed parsing (`SED_PATTERN`), flag normalization (`getRegexFlags`), and MarkdownV2/backslash escaping remain stable.
  - `sed.test.ts`: tests `parseSedCommands` with various inputs including multi-line replacements, tricky inputs, and edge cases.
  - `workerpool.test.ts`: validates queue behavior, concurrency limits, and error handling of a worker-pool-like abstraction.
  - `database.test.ts`: tests the database access patterns (history storage, mapping behavior, cleanup, and per-chat history limits) with an in-memory SQLite instance.
- When modifying sed parsing, history retention logic, or worker-pool behavior, update the corresponding tests and re-run:

```bash
bun test
```

or target just the relevant file with:

```bash
bun test workerpool.test.ts
```
