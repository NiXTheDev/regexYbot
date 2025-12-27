# Contributing to regexYbot

Thank you for your interest in contributing to regexYbot! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Project Structure](#project-structure)

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
   git remote add upstream https://github.com/USERNAME/regexYbot.git
   ```

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

## Running Tests

Run all tests:

```bash
bun test
```

Run tests in watch mode:

```bash
bun test --watch
```

## Code Style

This project uses ESLint and Prettier for code formatting and linting.

Check code style:

```bash
bun run lint
```

Format code:

```bash
bun run format
```

### Guidelines

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Keep functions focused and small
- Avoid using `any` types - use proper TypeScript types

## Submitting Changes

### Branch Naming

Use descriptive branch names:

- `fix/short-description` for bug fixes
- `feature/short-description` for new features
- `docs/short-description` for documentation changes
- `refactor/short-description` for code refactoring

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `fix`: Bug fix
- `feat`: New feature
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:

```
fix(worker): handle timeout errors gracefully
feat(logger): add colorized output support
docs(readme): update setup instructions
```

### Pull Request Process

1. Update the CHANGELOG.md with your changes
2. Ensure all tests pass: `bun test`
3. Ensure linting passes: `bun run lint`
4. Format your code: `bun run format`
5. Commit your changes with a clear message
6. Push to your fork
7. Open a pull request with:
   - Clear title describing the change
   - Description of what was changed and why
   - Reference any related issues
8. Wait for code review and address feedback

### Pull Request Checklist

- [ ] Tests added or updated
- [ ] CHANGELOG.md updated
- [ ] Code follows project style
- [ ] Self-reviewed code
- [ ] Documentation updated (if needed)
- [ ] All tests pass
- [ ] Linting passes

## Project Structure

```
regexYbot/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD workflows
├── index.ts               # Main bot entry point
├── hellspawn.ts           # Worker script for regex processing
├── logger.ts              # Logging utility
├── types.ts               # TypeScript type definitions
├── utils.ts               # Shared utility functions
├── config.ts              # Configuration management
├── utils.test.ts          # Test file
├── Dockerfile             # Docker image definition
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .editorconfig          # Editor configuration
├── .env.example           # Environment variables template
└── README.md              # Project documentation
```

### Key Components

- **index.ts**: Main bot logic using grammY framework
- **hellspawn.ts**: Worker pool for parallel regex execution
- **logger.ts**: Configurable logging system
- **types.ts**: Shared TypeScript interfaces and types
- **utils.ts**: Helper functions for common operations

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Provide detailed information when reporting issues
- Include steps to reproduce bugs

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
