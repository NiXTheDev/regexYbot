# Contributing to regexYbot

Thank you for your interest in contributing to regexYbot! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Critical: Branch Targeting](#critical-branch-targeting)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [External Contributor Workflow](#external-contributor-workflow)
- [Project Structure](#project-structure)

---

## Critical: Branch Targeting

**ALL pull requests MUST target the `dev` branch.**

### Why dev branch?

| Branch    | Purpose                              | Stability                   |
| --------- | ------------------------------------ | --------------------------- |
| `dev`     | Active development, receives all PRs | May have bugs, WIP features |
| `release` | Production-ready code                | Stable, tested              |

The `dev` branch is where all development happens. It's intentionally unstable - it can have broken code, work-in-progress features, and experimental changes. Once changes are tested and ready, maintainers merge `dev` into `release`.

### Examples

**CORRECT:**

```bash
# Creating a feature branch from dev
git checkout dev
git pull upstream dev
git checkout -b feature/my-awesome-feature
# ... make changes ...
git push origin feature/my-awesome-feature
# Open PR targeting `dev` branch
```

**INCORRECT:**

```bash
# Never target release directly
git checkout -b feature/my-feature  # from main/release
git push origin feature/my-feature
# PR targets `release` - WILL BE REJECTED
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (JavaScript runtime and package manager)
- [Git](https://git-scm.com/)
- A GitHub account

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/regexYbot.git
   cd regexYbot
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/NiXTheDev/regexYbot.git
   ```

---

## Development Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create a `.env` file with your Telegram bot token:

   ```bash
   cp .env.example .env
   # Edit .env and add your TOKEN
   ```

3. Run the bot in development mode:
   ```bash
   bun run dev
   ```

---

## Running Tests

Run all tests:

```bash
bun test
```

Run tests in watch mode:

```bash
bun test --watch
```

Run specific test file:

```bash
bun test src/tests/config.test.ts
```

---

## Code Style

This project uses ESLint and Prettier for code formatting and linting.

### Quick Check (Recommended)

Run all quality checks at once:

```bash
bun run ltf
# or
bun ltf
```

This runs: format -> typecheck -> lint -> test (technically the same order as CI/CD, but the first three steps run in parallel there, whereas the script runs one step at a time)

### Individual Commands

Check code style:

```bash
bun run lint
# or
bun lint
```

Format code:

```bash
bun run fmt
# or
bun fmt
```

Check formatting without writing:

```bash
bun run fmt:check
# or
bun fmt:check
```

### Code Guidelines

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Keep functions focused and small
- Avoid using `any` types - use proper TypeScript types
- No `console.log` in production code - use the Logger

---

## Submitting Changes

### Branch Naming

Use descriptive branch names:

- `fix/short-description` for bug fixes
- `feature/short-description` for new features
- `docs/short-description` for documentation changes
- `refactor/short-description` for code refactoring

### Commit Messages

Follow conventional commit format with **issue reference**:

```
type(scope): description

[optional body]

implements #N
```

**The `implements #N` footer is REQUIRED.** It links your commit to the issue it resolves.

Types:

- `fix`: Bug fix
- `feat`: New feature
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

#### Good Examples

```
feat(ratelimit): add per-user command limiting

Implements rate limiting with 30 commands/minute default.
Includes user-friendly error messages.

implements #29
```

```
fix(workerpool): resolve race condition on shutdown

Workers were not properly terminated during graceful shutdown
when queue had pending tasks.

implements #39
```

```
docs(readme): add new environment variables

Document CACHE_ENABLED, CACHE_MAX_SIZE, and CACHE_TTL_MS
configuration options.

implements #35
```

#### Bad Examples

```
fixed bug
```

Missing type, scope, body, and issue reference

```
feat: add new feature

Some description here.
```

Missing issue reference at the end

```
update code
```

No type, no description, no issue reference

### Multi-line Commit Template

For complex changes, use this template:

```bash
git commit -m "type(scope): short description

Longer explanation of what changed and why.
Can span multiple lines.

- Bullet points for specific changes
- Another change

implements #N"
```

### Pull Request Process

1. **Before creating PR:**
   - Ensure you're targeting `dev` branch
   - Run `bun ltf` and ensure all checks pass
   - Update CHANGELOG.md if applicable

2. **Create PR with:**
   - Clear title describing the change
   - Description of what was changed and why
   - Reference related issues (e.g., "Closes #40")

3. **Wait for review** and address feedback

### Pull Request Checklist

Before submitting your PR, verify:

- [ ] **Targets `dev` branch** (not `release`)
- [ ] Issue referenced in commits (`implements #N`)
- [ ] All tests pass (`bun ltf`)
- [ ] No lint errors or warnings
- [ ] Code is formatted (Prettier)
- [ ] TypeScript compiles without errors
- [ ] Self-reviewed the code
- [ ] Documentation updated (if needed)
- [ ] CHANGELOG.md updated (if applicable)

---

## External Contributor Workflow

### Complete Workflow Example

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/regexYbot.git
cd regexYbot

# 2. Add upstream remote
git remote add upstream https://github.com/NiXTheDev/regexYbot.git

# 3. Sync with upstream before starting work
git checkout dev
git pull upstream dev

# 4. Create your feature branch from dev
git checkout -b feature/my-feature

# 5. Make changes, commit with issue reference
git add .
git commit -m "feat(feature): add awesome feature

Detailed description here.

implements #42"

# 6. Push to your fork
git push origin feature/my-feature

# 7. Open PR on GitHub targeting `dev` branch
```

### Syncing Your Fork

Keep your fork up to date:

```bash
git checkout dev
git pull upstream dev
git push origin dev
```

### Handling Merge Conflicts

If your PR has conflicts:

```bash
# Checkout your feature branch
git checkout feature/my-feature

# Pull latest dev from upstream
git fetch upstream
git merge upstream/dev

# Resolve conflicts in your editor, then:
git add .
git commit -m "merge: resolve conflicts with dev"
git push origin feature/my-feature
```

### Testing Before PR

Always run full test suite before submitting:

```bash
# Full quality gate
bun ltf

# If any step fails, fix before PR:
bun fmt      # Format code
bun lint     # Check for issues
bun typecheck # TypeScript check
bun test     # Run tests
```

---

## Project Structure

```
regexYbot/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD workflows
├── src/
│   ├── index.ts           # Main bot entry point
│   ├── hellspawn.ts       # Worker script for regex processing
│   ├── logger.ts          # Logging utility
│   ├── types.ts           # TypeScript type definitions
│   ├── utils.ts           # Shared utility functions
│   ├── config.ts          # Configuration management
│   ├── workerPool.ts      # Dynamic worker pool
│   ├── sed.ts             # Sed command handling
│   ├── database.ts        # Database service
│   └── tests/             # Test files
├── Dockerfile             # Docker image definition
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .editorconfig          # Editor configuration
├── .env.example           # Environment variables template
├── README.md              # Project documentation
├── CHANGELOG.md           # Release notes
└── CONTRIBUTING.md        # This file
```

### Key Components

- **index.ts**: Main bot logic using grammY framework
- **hellspawn.ts**: Worker script for parallel regex execution
- **workerPool.ts**: Dynamic worker pool with auto-scaling
- **logger.ts**: Configurable logging system
- **types.ts**: Shared TypeScript interfaces and types
- **utils.ts**: Helper functions for common operations
- **sed.ts**: Sed command parsing and handling
- **database.ts**: In-memory SQLite database service

---

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Provide detailed information when reporting issues
- Include steps to reproduce bugs
- Reference the issue number in your commits

---

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
