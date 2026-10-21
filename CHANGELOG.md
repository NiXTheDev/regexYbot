# Changelog

All notable changes to this project will be documented in this file.

<details open>
<summary><b>[0.3.0-rc1] - 2026-10-17</b></summary>

> **Preview release.** The bot now runs on grammY v2 (`2.0.0-beta.6`) while the
> `@grammyjs/*` plugins are still on v1, so parts of this build are knowingly
> broken. Please read **Known Issues** before deploying.

### Breaking Changes

- Migrated to grammY v2 (`npm:@jsr/grammyjs__grammy@2.0.0-beta.6`). Middleware,
  handler registration and `Context` typings were updated for the v2 API.

### Features

- `/privacy` gained a Delete-my-data button (private chats): after an inline
  confirmation the bot deletes this chat's stored message history and
  reply-mapping rows, localized across all 11 locales.
- Localization coverage completed: user-facing chrome that was still
  hard-English — `/health` and `/metrics` output, `/regexhelp` menus and
  back labels, ephemeral optimization tips, the sed performance line, and
  the non-retryable Telegram-API failure notice — now resolves through the
  Fluent locales. A bound `Translator` type threads the locale through the
  formatters that have no Telegram context; the error classes keep their
  `getUserMessage()` API as a fallback. All 11 locales remain at 53-key
  parity, enforced by a test.

### Bug Fixes

- `/diff` works again: the sed command is now stored with the bot reply
  (`bot_replies.sed_command`) and read back, so the applied command can be
  reconstructed instead of being lost after the reply was sent.
- Restored `/language` persistence — the locale selected via `/language set`
  (and by `/privacy`) now outlives the update that set it. grammY v2 no longer
  provides the session middleware that v1 bundled, so a small in-memory session
  middleware (`src/session.ts`) was added, keyed per chat to match the previous
  default. Note: it is in-memory only, so language choices reset on restart.
- `DatabaseService` tests are now order-independent.
- Shipped binaries no longer crash at boot: the Fluent locales were loaded
  from a CWD-relative `src/locales` directory that `bun build --compile`
  bundles cannot carry, so an executable started outside a repository
  checkout threw ENOENT from the i18n constructor. All 11 `.ftl` files are
  now imported as inline text and registered through the plugin's
  `loadLocaleSync`, leaving no working-directory dependence in dev,
  container or binary runs.

### Maintenance

- Enabled the TypeScript strict flags that had been placed outside
  `compilerOptions` and were therefore inert, then enabled
  `noUncheckedIndexedAccess` and fixed the fallout (48 sites).
- Live Telegram API tests are now opt-in behind `LIVE_API_TESTS`, so the
  pre-commit gate no longer needs a real bot token.
- Applied Prettier formatting to files that had been committed without the gate.
- CI: prerelease builds are tagged `preview` and keep the roaming `latest`/`dev`
  tags; `release` is never written by a prerelease build.
- CI/lockfile: `--frozen-lockfile` is now enforced at every install site
  (release workflow, Dockerfile, security audit), matching the check
  workflows; the dead "Generate version" step of the PR validation build
  (and the "Install Bun" step that existed only to serve it) was removed —
  that job passes its metadata as explicit build-args; `docker-compose.yml`
  gained a comment explaining the explicit 1m `stop_grace_period`
  (Docker's default grace period is 10s).
- Stale module exports that no caller referenced were removed.
- The pre-commit hook now delegates to the package scripts (`fmt:check`,
  `lint`) instead of inlining them and types via bun 1.4.3's native
  `bun check` (the legacy `typecheck` script is a loud redirect), keeping
  the gate consistent with `bun run ltf:check`; the plain (no `--retry`)
  `bun test` in the hook is deliberate.
- Docs pass: README gained the full command list and corrected run
  instructions (`bun run main` / `bun run dev`), an accurate dynamic
  worker-pool bullet, the `src/locales/` path, and real graceful-shutdown
  observation steps (the previously referenced test script does not
  exist); TESTING.md documents the `LIVE_API_TESTS` opt-in;
  `.env.example` documents `FEATURE_ROAST` / `ROAST_CHANCE`;
  CONTRIBUTING documents enabling the `.githooks/` pre-commit hooks.

### Known Issues (preview)

- `@grammyjs/runner`'s `run()` requires a documented cast against the v2 typings
  (grammyjs/runner#28).
- `exactOptionalPropertyTypes` stays disabled: `@grammyjs/hydrate` v1 widens
  `Update.inline_query` to `InlineQueryX | undefined`, which stops `MyContext`
  from satisfying `Context`. Re-enable once a v2 plugin release exists.
- `@grammyjs/i18n`, `@grammyjs/hydrate`, `@grammyjs/commands` and
  `@grammyjs/auto-retry` remain on v1 against grammY v2. i18n v2 exists only as
  an unpublished Deno/JSR package and cannot be installed.
- `bun test` can occasionally exit non-zero from a workerpool flake; CI runs it
  with `--retry=5`.
- npm.jsr.io has been stalling or resetting connections from every network
  path tested, so the frozen installs can keep CI red until grammY v2 ships
  a proper npm release. An offline fallback has been spike-verified: copying
  the locally cached beta.6 packages into a `file:`-dependency vendor tree
  installs and boots with the registry resolved to a dead endpoint. The
  vendored package's own dependency must be rewired to a relative `file:`
  reference, since a registry range (`^0.3.1`) otherwise still hits the
  network.

</details>

<details open>
<summary><b>[0.2.2.2] - 2026-08-11</b></summary>

### Bug Fixes

- Fixed Telegram 403 errors: `receiver_user_id` is now only sent in group/supergroup chats for dangerous-pattern warnings (`src/sed.ts`) and optimization tips (`src/optimizationTips.ts`), with a graceful fallback so sed still executes if the warning fails to send
- Deduplicated CI version detection: `push-checks.yml` now parses `.version.json` instead of duplicating version detection logic
- Fixed self-build version reporting: `.version.json` is baked at Docker build time and a new `resolveFromVersionJson()` tier was added, so self-builders get the correct version/commit instead of `0000000`
- Removed dead dependencies: `@grammyjs/hydrate`, `@grammyjs/ratelimiter`, and `minimatch`

</details>

<details open>
<summary><b>[0.2.2.1-hf1] - 2026-08-05</b></summary>

### Bug Fixes

- Fixed broken `build-linux` script — removed stray `--define` fragment so CI's `--target`/`--outfile` args append correctly
- Restored link preview preservation — bot replies now respect the source message's `link_preview_options` when present:
  - `reply_to_message` path returns the replied-to message's `link_preview_options` in extras
  - Edited messages store extras correctly (destructured from `ctx.editedMessage` when `isEdit`)
  - When the source message has no preview options, the parameter is omitted (Telegram default behavior)

</details>

<details>
<summary><b>[0.2.2.1] - 2026-07-30</b></summary>

### Version System

- Single-source `src/version.ts` with 4-tier resolution (first non-null wins):
  1. Git commands (works in dev with git installed)
  2. Raw `.git` file reading (works without git binary)
  3. Environment variables (Docker via build args → ENV)
  4. Fallback defaults (commit=0000000, version from package.json)
- Deleted `scripts/generate-version.ts` — logic fully ported to `src/version.ts`
- `package.json` generate script now runs `bun run src/version.ts` directly
- `.version.json` generated at runtime for binary builds via `--define`

### Docker & CI

- Dockerfile accepts `VERSION`, `COMMIT`, `RELEASED_AT`, `CHANGES` as build args → ENV passthrough
- CI workflows (push-checks, pr-checks) compute version info and pass as Docker build-args
- Empty VERSION guard in CI prevents invalid Docker tags

### Bug Fixes

- MarkdownV2 dangerous pattern warning fix — escaped text prevents Telegram 400 parse errors
- Renamed `escapeForMarkdownV2AndBackslashes` → `escapeMarkdownV2` for clarity
- History storage uses Telegram-returned `sentMsg.text` (fixes trailing space disconnect)
- `.trimEnd()` applied to sed result text at source

### Maintenance

- Fixed empty catch block lint error in `version.ts`

</details>

<details>
<summary><b>[0.2.2] - 2026-07-20</b></summary>

### grammY Upgrade

- Upgraded grammY from v1.40.0 to v1.45.1 with updated plugin ecosystem

### Rich Messages API

- Migrated all bot messages from MarkdownV2 to Telegram's Rich Messages API
  - Supports bold, italic, code, strikethrough, and block quotes natively
- Removed `escapeForMarkdownV2AndBackslashes` utility — no longer needed

### Ephemeral Messages

- Optimization tips sent as ephemeral messages (visible only to regex author, auto-deleted after 10 seconds)
- `/regexhelp` response is ephemeral with automatic cleanup when a new one is requested
- `/explain` response is ephemeral
- Dangerous pattern warnings are ephemeral to the regex author

### Optimization Tips Fix

- Fixed false positive: `\\`, `\S`, `\f`, `\v` no longer flagged as unnecessary escapes
- Per-escape tips now provide specific pattern/reason instead of generic messages
- Capturing groups warning suppressed when all groups are referenced in the replacement string

</details>

<details>
<summary><b>[0.2.1.1] - 2026-05-22</b></summary>

### Feature Toggles via Environment Variables

- **FEATURE_TIPS**: Enable/disable regex optimization tips (default: true)
  - Controls whether optimization suggestions like `[0-9] → \d` are shown to users
  - Tips auto-delete after 10 seconds to avoid chat clutter
- **FEATURE_WARNINGS**: Enable/disable dangerous pattern warnings (default: true)
  - Controls whether ReDoS risk warnings with complexity scores are shown
  - Internal logging and analysis still run regardless of toggle state

</details>

<details>
<summary><b>[0.2.1] - 2026-04-28</b></summary>

### Diff Command Argument Support

- **/diff Command**: Added optional format argument for flexible output
  - Usage: `/diff [plain|true|image]`
  - Backward compatible: no argument defaults to `plain` format
- **Plain Format (default)**: Inline diff using `~~old~~ *new*` markdown syntax
- **True Format**: Markdown diff block with ```diff syntax highlighting
- **Image Format**: SVG image visualization of the diff

</details>

<details>
<summary><b>[0.2.0] - 2026-04-27</b></summary>

### New Commands & Observability (#68)

- **/version Command**: Added version information command
  - Displays current bot version and build info
  - Useful for debugging and support
- **Improved Error Messages**: Enhanced error handling and messaging
  - More descriptive error context for users
  - Better error categorization

### Performance & Metrics (#68)

- **Cache Metrics**: Enhanced LRU cache instrumentation
  - Cache hit/miss tracking
  - Performance monitoring improvements
- **Worker Queue Tracking**: Added queue depth monitoring
  - Real-time queue statistics
  - Better visibility into worker pool health

### Security (#68)

- **CVE Fix**: Security vulnerability remediation
  - Patched identified security issue
  - Updated dependencies with security fixes

### Infrastructure (#68)

- **Pre-built Binaries**: Added binary distribution support
  - Linux binaries (`regexybot-linux-x64.tar.gz`)
  - Windows binaries (`regexybot-windows-x64.zip`)
  - Self-contained executables (no Bun/Node required)

</details>

<details>
<summary><b>[0.1.10] - 2026-04-27</b></summary>

### WorkerPool Consolidation (#57)

- **WorkerPool V1 Deprecation**: Merged WorkerPoolV2 into WorkerPool
  - Unified worker pool implementation
  - Dynamic scaling, health monitoring, idle worker termination
  - Graceful shutdown with configurable drain mode
  - Removed separate WorkerPoolV2 interface

### New Commands (#57)

- **/explain Command**: Pattern explanation utility
  - Breaks down regex patterns into components
  - Explains character classes, quantifiers, groups
  - Shows match examples
- **/health Command**: Health status monitoring
  - Real-time health check endpoint
  - Status: healthy/degraded/unhealthy
  - Configurable thresholds
- **/metrics Command**: Prometheus-style metrics
  - Regex execution stats
  - Cache performance metrics
  - Worker pool statistics

### Security & Safety (#57)

- **Dangerous Patterns Detection**: Pattern safety analysis
  - Identifies potentially dangerous regex patterns
  - Polynomial/catastrophic backtracking warnings
  - ReDoS detection
- **Optimization Tips**: Regex optimization guidance
  - Performance improvement suggestions
  - Pattern simplification advice

### Regex Help (#57)

- **Regex Help Command**: Built-in regex documentation
  - Common pattern examples
  - Flag explanations
  - Capture group reference guidance

### Internationalization (#57)

- **Multi-Language Support**: Full i18n with 11 languages
  - English (default), German, Spanish, Italian, Polish
  - Swedish, Russian, Ukrainian, Japanese, Korean, Chinese
  - Fluent format localization files
  - Automatic language detection from Telegram settings

</details>

<details>
<summary><b>[0.1.9] - 2026-02-15</b></summary>

### Epic: regexYbot Enhancement Roadmap

Complete overhaul with 6 major feature areas, 166 tests, and comprehensive documentation.

### Health Monitoring & Observability (#27)

- **HealthMonitor System**: Real-time health tracking with status detection
  - Automatic status calculation: healthy/degraded/unhealthy
  - Configurable thresholds for error rates and queue depth
  - Event-driven status change notifications
  - 14 comprehensive tests covering all health scenarios

### Test Suite Expansion (#28)

- **80+ New Tests**: Expanded from 77 to 166 tests
  - `config.test.ts`: 24 tests for configuration validation
  - `logger.test.ts`: 11 tests for logging functionality
  - `errorHandling.test.ts`: 19 tests for error scenarios
  - `telegram.test.ts`: 12 tests for Telegram integration
  - Full coverage of new features and edge cases

### Security & Anti-Spam (#29)

- **Per-User Rate Limiting**: Configurable spam prevention
  - Default: 30 commands/minute per user
  - Smart counting: N commands in message = N points
  - Skips edits (corrections, not spam)
  - User-friendly error messages with wait times

### Performance Optimizations (#30)

- **Regex Pattern Caching**: LRU cache with TTL support
  - Default: 1000 patterns, 5-minute TTL
  - Configurable via `CACHE_ENABLED`, `CACHE_MAX_SIZE`, `CACHE_TTL_MS`
  - Significant performance boost for repeated patterns
- **Database Indexes**: Added indexes for faster queries
  - `idx_message_history_chat_id` for chat lookups
  - `idx_bot_replies_target` for reply mapping lookups

### Error Handling & Resilience (#31)

- **Custom Error Hierarchy**: 6 granular error types
  - `BotError` (base), `RegexError`, `TelegramAPIError`
  - `RateLimitError`, `WorkerError`, `CircuitBreakerError`
  - User-friendly error messages with context
- **Circuit Breaker Pattern**: Prevents cascading failures
  - States: CLOSED → OPEN → HALF_OPEN
  - Configurable thresholds and timeouts
  - Automatic recovery after cooldown period

### Code Quality (#34)

- **JSDoc Documentation**: Comprehensive inline docs
  - DatabaseService methods fully documented
  - Parameter types and return values specified
  - Usage examples and edge cases explained
- **Zero Lint Warnings**: Clean codebase
  - Fixed all `any` type warnings in tests
  - Added proper type annotations
  - 166 tests with zero warnings

### Documentation (#35)

- **Updated README**: Complete feature list and env vars
  - Added all 25+ environment variables
  - Documented WorkerPoolV2, rate limiting, caching
  - New features: health monitoring, circuit breaker
- **Enhanced CHANGELOG**: This release notes section

</details>

<details>
<summary><b>[0.1.7.1] - 2026-02-09</b></summary>

### Architecture Refactoring

- **Centralized Configuration**: Added comprehensive `config.ts` module with typed env var loading and validation
  - Supports 17+ configuration options with sensible defaults
  - Validates integers, booleans, strings, and log levels
  - Test mode support (skips TOKEN validation during tests)
  - Frozen CONFIG object prevents accidental mutations

- **Module Decomposition**: Split `index.ts` (643 lines → 212 lines, 67% smaller)
  - Extracted `DatabaseService` to `database.ts` with full test helper methods
  - Extracted `WorkerPool` to `workerPool.ts` with graceful shutdown support
  - Extracted `SedHandler` and `parseSedCommands` to `sed.ts`
  - Clean dependency injection pattern throughout
  - No circular dependencies between modules

### Testing

- **Comprehensive Test Suite**: Added 31 new tests in `tests/sed.test.ts`
  - Basic command parsing (simple, flags, multiple)
  - Multi-line replacements (single, multiple, mixed, indented)
  - Tricky inputs (escaped slashes, whitespace, embedded s/)
  - Edge cases (empty strings, unicode, long text, nested slashes)
  - Real-world scenarios (URLs, code blocks, markdown, capture groups)
  - Total test count: 66 across 4 files

### Operations

- **Graceful Shutdown**: Implemented proper SIGINT/SIGTERM handling
  - `shutdown()` method in WorkerPool rejects queued tasks cleanly
  - Idempotent shutdown flag prevents double-execution
  - Bot stops accepting updates before terminating workers
  - Proper error handling and exit codes

### Infrastructure

- **Branching Strategy**: Established dev/main workflow
  - `main` branch: stable releases with version tags
  - `dev` branch: active development with `dev`, `next`, `latest` tags
  - Docker images tagged appropriately per branch
  - CI workflows updated to handle both branches

### Documentation

- Updated `README.md` with:
  - Data Persistence section (ephemeral in-memory DB)
  - Complete Environment Variables table (17 vars)
  - Updated Project Structure with new modules
  - Branching Strategy & Releases section
- Updated `AGENTS.md` with:
  - Architecture overview reflecting modular structure
  - DatabaseService documentation
  - SedHandler documentation
  - Testing strategy including sed.test.ts

</details>

<details>
<summary><b>[0.1.7] - 2025-12-27</b></summary>

### CI/CD Improvements

- Fixed GitHub Actions workflow issues and Docker tag generation
- Added comprehensive version tag generation supporting all permutations (X.Y.Z, X.Y, X) and pre-release suffixes
- Fixed Docker Hub and GHCR authentication issues
- Set up proper multi-platform builds (linux/amd64, linux/arm64)
- Added automated dependabot automerge workflow
- Added secret scanning workflow with Gitleaks
- Added security audit workflow for dependency scanning
- Fixed PR validation workflow for proper build testing

### Infrastructure

- Separated GHCR_TOKEN for proper GitHub Container Registry authentication
- Lowercased repository names for Docker tag compatibility
- Fixed platform support to match oven/bun base image (amd64, arm64 only)

</details>

<details>
<summary><b>[0.1.6] - 2025-12-XX</b></summary>

### Image Improvements

- Optimized Docker image size and build process
- Improved multi-stage build configuration
- Enhanced platform compatibility

</details>

<details>
<summary><b>[0.1.5] - 2025-12-XX</b></summary>

### Logic Improvements

- Fixed edge cases in regex substitution logic
- Improved worker pool error handling
- Enhanced performance monitoring

</details>

<details>
<summary><b>[0.1.4] - 2025-12-XX</b></summary>

### Logic Improvements

- Fixed bug with capture group references in replacements
- Improved timeout handling for worker threads
- Added better error messages for invalid regex patterns

</details>

<details>
<summary><b>[0.1.3] - 2025-12-XX</b></summary>

### Image Improvements

- Updated base image to latest oven/bun
- Fixed Dockerfile layer caching
- Improved image build times

</details>

<details>
<summary><b>[0.1.2] - 2025-12-XX</b></summary>

### Logic Improvements

- Fixed message editing detection and response updates
- Improved cleanup of old message mappings
- Enhanced flood control handling

</details>

<details>
<summary><b>[0.1.1] - 2025-12-XX</b></summary>

### Image Improvements

- Initial multi-architecture Docker image support
- Added Docker Hub and GitHub Container Registry deployment
- Set up automated build and deploy workflow

</details>

<details>
<summary><b>[0.1.0] - 2025-12-XX</b></summary>

### Initial Working Release

- Bot now fully functional with core features working
- Sed-style regex substitution (`s/pattern/replacement/flags`)
- Edit support for updating substitutions
- Worker pool for parallel regex processing
- Performance timing with `p` flag
- Configurable logging system
- Target protection to prevent self-modification
- Worker timeout (60s default) to prevent hanging
- Opportunistic cleanup of old data (48h retention)
- Error resilience with proper Telegram API handling
- Group support with capture group references

</details>

<details>
<summary><b>[0.0.5] - 2025-12-XX</b></summary>

### Development

- Fixed critical bugs preventing bot from working
- Resolved Telegram API integration issues
- Fixed worker communication problems

</details>

<details>
<summary><b>[0.0.4] - 2025-12-XX</b></summary>

### Development

- Continued debugging and fixing core functionality
- Improved error handling and logging
- Fixed database initialization issues

</details>

<details>
<summary><b>[0.0.3] - 2025-12-XX</b></summary>

### Development

- Fixed grammY integration issues
- Resolved worker pool startup problems
- Improved regex processing reliability

</details>

<details>
<summary><b>[0.0.2] - 2025-12-XX</b></summary>

### Development

- Initial implementation of core features
- Added Telegram bot integration
- Implemented worker pool architecture
- Basic sed-style substitution functionality

</details>

<details>
<summary><b>[0.0.1] - 2025-12-XX</b></summary>

### Initial Release

- Initial codebase
- Project structure setup
- Basic configuration and types
- Logging utility
- Utility functions

</details>
