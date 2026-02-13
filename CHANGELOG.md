# Changelog

All notable changes to this project will be documented in this file.

<details open>
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
