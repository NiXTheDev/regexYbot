# TODO

High-level plan for future improvements to regexYbot. This is intentionally non-binding and can be re-scoped as needed.

## 1. Centralized configuration & env knobs (`config.ts`)

- [ ] Introduce a typed config loader in `config.ts` that:
  - Reads relevant env vars (`TOKEN`-adjacent knobs, `WORKER_POOL_SIZE`, cleanup intervals, history limits, timeouts, retry limits, etc.).
  - Applies sane defaults matching the current hardcoded values.
  - Performs basic validation (e.g., non-negative integers, sensible upper bounds) and logs warnings for invalid values.
- [ ] Ensure all other modules (`index.ts`, worker pool, DB service, healthcheck wiring) read values only from `CONFIG`, not directly from `process.env`.
- [ ] Keep `README.md` and `.env.example` in sync with the set of supported env knobs.
- [ ] Leave room (e.g., helper function or tiny abstraction) for optional hot-reload of specific values later (e.g., cleanup interval) without committing to it now.

## 2. Module decomposition (shrinking `index.ts`)

Goal: keep `index.ts` as a thin composition root.

- [ ] Extract DB-related concerns into a dedicated module, e.g. `database.ts`:
  - SQL instance creation.
  - Table/index creation.
  - `DatabaseService` class.
- [ ] Extract worker pool concerns to e.g. `workerPool.ts`:
  - `WorkerPool` class.
  - Dependencies injected via constructor (`CONFIG`, logger, worker script path).
- [ ] Extract sed-specific logic to e.g. `sed.ts`:
  - `parseSedCommands`.
  - Possibly higher-level helpers that orchestrate sed command chains, parameterized by `workerPool` and `dbService`.
- [ ] Keep `bot` wiring and grammY specifics in `index.ts` (or split later into a `bot.ts`) and update imports accordingly.
- [ ] Verify there are no circular dependencies between the new modules.

## 3. DB service & tests: remove duplication

- [ ] Refactor `DatabaseService` to use `this.db` consistently internally (no reliance on the outer `db` variable).
- [ ] Export `DatabaseService` from the new DB module and use it directly in tests instead of `TestDatabaseService`.
- [ ] Update `database.test.ts` to:
  - Construct `DatabaseService` with its own in-memory `SQL` instance.
  - Import `CONFIG` from `config.ts` where limits are asserted (e.g., `MAX_HISTORY_PER_CHAT`).
- [ ] Add/adjust tests to ensure behavior stays identical during the refactor (especially around cleanup and history limits).

## 4. Worker pool v2: lazy, bounded, and load-aware

This is a larger change; consider doing it in a separate branch.

- [ ] Design a `WorkerPool` interface that can support both current behavior and a future dynamic implementation (lazy init, scale up/down).
- [ ] Implement a v2 pool with the following characteristics:
  - `MAX_WORKER_POOL_SIZE` cap from config.
  - Start with zero or a minimal number of workers.
  - Spawn new workers on demand up to the cap when the queue grows.
  - Track a per-worker queue length or load metric.
  - Dispatch new tasks to the least-loaded worker.
- [ ] Implement idle scale-down:
  - Track last-active time per worker.
  - After a configurable idle period (e.g., 15 minutes), terminate excess workers down to a minimal pool size.
- [ ] Preserve existing timeout semantics and error messages when tasks exceed `WORKER_TIMEOUT_MS`.
- [ ] Extend tests (or add new ones) to cover:
  - Scaling up under load and scaling down on idle.
  - Correct ordering/behavior when many sed commands are queued.
  - Behavior when the pool is at hard cap and more work arrives.

## 5. Regex behavior & ergonomics

- [ ] Document in code (and optionally README) the exact rules for `parseSedCommands`:
  - New command starts on lines whose `trim().startsWith("s/")`.
  - Multi-line replacements are supported by joining subsequent lines until the next command.
- [ ] Add tests that directly exercise `parseSedCommands` with tricky inputs:
  - Mixed plain text + sed command lines.
  - Multi-line replacements with indentation.
  - Edited commands that change line structure.
- [ ] Review behavior against the original regexbot expectations where relevant (especially reply-less sed application to the last message) and add tests encoding the intended semantics.

## 6. Logging & observability improvements

- [ ] Evaluate replacing the custom `Logger` with `@std/log` from JSR:
  - Confirm needed capabilities: log levels, per-module context, and color support.
  - Decide whether to keep a thin wrapper to preserve the existing `Logger` API and templates.
- [ ] If migrating, implement a compatibility layer so existing code (`new Logger("Main")`, etc.) doesn’t need to change everywhere at once.
- [ ] Introduce basic span-like grouping for operations (e.g. one span for a single sed chain execution), even if it’s just a correlation ID included in logs.
- [ ] Improve user-facing error differentiation:
  - Distinguish timeouts vs. invalid regex vs. generic worker errors.
  - Ensure timeout messages are clear but do not leak sensitive pattern details.

## 7. Graceful shutdown & lifecycle

- [ ] Wire process signal handlers (`SIGINT`, `SIGTERM` where supported) to:
  - Call `bot.stop()`.
  - Stop accepting new tasks in the worker pool and drain/terminate workers.
  - Cleanly close any other resources if/when introduced.
- [ ] Ensure shutdown handling is idempotent and doesn’t throw inside the signal handler.
- [ ] Consider adding a small integration-style test or manual test plan for graceful shutdown (particularly in Docker).

## 8. Persistence strategy (confirm and document in-memory DB)

- [ ] Keep the `sqlite://:memory:` database as the default and only supported mode for now.
- [ ] Explicitly document in README and/or comments near DB initialization that:
  - All history and mappings are ephemeral and reset on process restart.
  - The retention window is intended only to support Telegram’s edit window and reply-less sed behavior.
- [ ] Optionally, centralize the “retention is short-lived and ephemeral” rationale in `config.ts` near `CLEANUP_INTERVAL_MS` and related knobs.

## 9. Documentation & meta files

- [ ] After major structural changes (config, module splits, worker pool v2), update:
  - `README.md` (setup, behavior, and any changed env knobs).
  - `AGENTS.md` (architecture overview, key module locations, worker pool behavior).
- [ ] Optionally maintain a short changelog entry explaining the worker pool v2 and config refactor for future contributors.
