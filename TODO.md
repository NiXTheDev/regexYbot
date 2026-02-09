# TODO

High-level plan for future improvements to regexYbot. This is intentionally non-binding and can be re-scoped as needed.

## 1. Centralized configuration & env knobs (`config.ts`)

- [x] Introduce a typed config loader in `config.ts` that:
  - Reads relevant env vars (`TOKEN`-adjacent knobs, `WORKER_POOL_SIZE`, cleanup intervals, history limits, timeouts, retry limits, etc.).
  - Applies sane defaults matching the current hardcoded values.
  - Performs basic validation (e.g., non-negative integers, sensible upper bounds) and logs warnings for invalid values.
- [x] Ensure all other modules (`index.ts`, worker pool, DB service, healthcheck wiring) read values only from `CONFIG`, not directly from `process.env`.
- [x] Keep `README.md` and `.env.example` in sync with the set of supported env knobs.
- [x] Leave room (e.g., helper function or tiny abstraction) for optional hot-reload of specific values later (e.g., cleanup interval) without committing to it now.

## 2. Module decomposition (shrinking `index.ts`)

Goal: keep `index.ts` as a thin composition root.

- [x] Extract DB-related concerns into a dedicated module, e.g. `database.ts`:
  - SQL instance creation.
  - Table/index creation.
  - `DatabaseService` class.
- [x] Extract worker pool concerns to e.g. `workerPool.ts`:
  - `WorkerPool` class.
  - Dependencies injected via constructor (`CONFIG`, logger, worker script path).
- [x] Extract sed-specific logic to e.g. `sed.ts`:
  - `parseSedCommands`.
  - `SedHandler` class with dependency injection for worker pool and reply function.
- [x] Keep `bot` wiring and grammY specifics in `index.ts` and update imports accordingly.
- [x] Verify there are no circular dependencies between the new modules.

## 3. DB service & tests: remove duplication

- [x] Refactor `DatabaseService` to use `this.db` consistently internally (no reliance on the outer `db` variable).
- [x] Export `DatabaseService` from the new DB module and use it directly in tests instead of `TestDatabaseService`.
- [x] Update `database.test.ts` to:
  - Construct `DatabaseService` with its own in-memory `SQL` instance.
  - Import `CONFIG` from `config.ts` where limits are asserted (e.g., `MAX_HISTORY_PER_CHAT`).
- [x] Add/adjust tests to ensure behavior stays identical during the refactor (especially around cleanup and history limits).

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

- [x] Document in code (and optionally README) the exact rules for `parseSedCommands`:
  - New command starts on lines whose `trim().startsWith("s/")`.
  - Multi-line replacements are supported by joining subsequent lines until the next command.
- [x] Add tests that directly exercise `parseSedCommands` with tricky inputs:
  - Mixed plain text + sed command lines.
  - Multi-line replacements with indentation.
  - Edited commands that change line structure.
- [x] Review behavior against the original regexbot expectations where relevant (especially reply-less sed application to the last message) and add tests encoding the intended semantics.

## 6. Logging & observability improvements

- [x] Evaluate replacing the custom `Logger` with `@std/log` from JSR:
  - **Decision**: Keep custom Logger - @std/log is deprecated and overkill for our needs.
  - Evaluated @denosaurs/log as alternative but still not necessary.
- [x] Introduce correlation IDs for operation tracing:
  - Added `{cid}` placeholder to LOG_TEMPLATE
  - Supports `{cid}`, `{cid:short}`, and `{cid:full}` formats
  - Uses AsyncLocalStorage to track correlation context across async operations
  - Each message/edit handler gets its own unique correlation ID
  - Format: base36(timestamp)-base36(random) (e.g., "abc123-def456")
- [x] Add timestamp support:
  - `{timestamp}` - DD/MM/YYYY HH:mm:ss format
  - `{timestamp(unix)}` - Unix timestamp with milliseconds
  - `{timestamp(ISO)}` - ISO 8601 format
  - `{timestamp(datetime)}` - Explicit DD/MM/YYYY HH:mm:ss
- [x] Improve error differentiation:
  - Timeouts already have clear messages with WORKER_TIMEOUT_MS info
  - Invalid regex errors are caught and reported clearly
  - All errors include correlation ID when in operation context

## 7. Graceful shutdown & lifecycle

- [x] Wire process signal handlers (`SIGINT`, `SIGTERM` where supported) to:
  - Call `bot.stop()`.
  - Stop accepting new tasks in the worker pool and drain/terminate workers.
  - Cleanly close any other resources if/when introduced.
- [x] Ensure shutdown handling is idempotent and doesn't throw inside the signal handler.
- [ ] Consider adding a small integration-style test or manual test plan for graceful shutdown (particularly in Docker).

## 7.5. Smart worker queue drain (shutdown enhancement)

- [ ] Implement intelligent queue draining during shutdown:
  - Queue all pending Telegram updates for workers instead of rejecting them.
  - Scale up workers temporarily past the normal limit during shutdown.
  - Process all queued tasks and send replies/edits before exiting.
  - Complete shutdown within Docker's 10-second grace period (or document `--stop-timeout` requirement).
- [ ] Add configuration option for graceful drain vs immediate shutdown.

## 8. Persistence strategy (confirm and document in-memory DB)

- [x] Keep the `sqlite://:memory:` database as the default and only supported mode for now.
- [x] Explicitly document in README and/or comments near DB initialization that:
  - All history and mappings are ephemeral and reset on process restart.
  - The retention window is intended only to support Telegram's edit window and reply-less sed behavior.
- [x] Optionally, centralize the "retention is short-lived and ephemeral" rationale in `config.ts` near `CLEANUP_INTERVAL_MS` and related knobs.

## 9. Documentation & meta files

- [x] After major structural changes (config, module splits, worker pool v2), update:
  - `README.md` (setup, behavior, and any changed env knobs).
  - `AGENTS.md` (architecture overview, key module locations, worker pool behavior).
- [ ] Optionally maintain a short changelog entry explaining the worker pool v2 and config refactor for future contributors.
