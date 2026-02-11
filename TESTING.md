# Testing Guide

This document describes how to test the regexYbot, with a focus on graceful shutdown behavior.

## Table of Contents

- [Automated Tests](#automated-tests)
- [Manual Testing](#manual-testing)
  - [Graceful Shutdown](#graceful-shutdown)
  - [Docker Testing](#docker-testing)
- [CI/CD Testing](#cicd-testing)

## Automated Tests

Run the full test suite:

```bash
bun test
```

Run specific test files:

```bash
bun test src/tests/database.test.ts
bun test src/tests/sed.test.ts
bun test src/tests/utils.test.ts
bun test src/tests/workerpool.test.ts
bun test src/tests/shutdown.test.ts  # Requires TOKEN env var
```

**Note:** The shutdown integration tests require a valid `TOKEN` environment variable. If TOKEN is not set, these tests will be skipped automatically.

## Manual Testing

### Graceful Shutdown

#### Test 1: Local SIGINT (Ctrl+C)

1. Start the bot:

   ```bash
   bun run main
   ```

2. Wait for "Bot started" message

3. Press `Ctrl+C`

**Expected Result:**

- Bot logs "Received SIGINT, starting graceful shutdown..."
- Bot stops accepting updates
- Worker pool shuts down
- Process exits with code 0
- No error messages in logs

#### Test 2: Local SIGTERM

1. Start the bot in background:

   ```bash
   bun run main &
   BG_PID=$!
   ```

2. Wait a few seconds for startup

3. Send SIGTERM:
   ```bash
   kill -TERM $BG_PID
   ```

**Expected Result:**

- Same as Test 1
- Process exits with code 0

#### Test 3: Multiple Signals (Idempotency)

1. Start the bot:

   ```bash
   bun run main &
   BG_PID=$!
   ```

2. Send multiple SIGTERM rapidly:
   ```bash
   kill -TERM $BG_PID
   sleep 0.1
   kill -TERM $BG_PID
   ```

**Expected Result:**

- Bot handles first signal and starts shutdown
- Subsequent signals are ignored (idempotent)
- Clean exit with code 0

### Docker Testing

#### Test 4: Docker Stop

1. Build and run the Docker image:

   ```bash
   docker build -t regexybot-test .
   docker run -e TOKEN=$TOKEN --name test-bot regexybot-test
   ```

2. In another terminal, stop the container:
   ```bash
   docker stop test-bot
   ```

**Expected Result:**

- Container stops within 10 seconds (default grace period)
- Exit code 0
- Logs show graceful shutdown sequence

#### Test 5: Docker Compose Stop

1. Create a `docker-compose.test.yml`:

   ```yaml
   version: "3.8"
   services:
     bot:
       build: .
       environment:
         - TOKEN=${TOKEN}
   ```

2. Start and stop:
   ```bash
   docker compose -f docker-compose.test.yml up -d
   docker compose -f docker-compose.test.yml stop
   ```

**Expected Result:**

- Clean shutdown within grace period
- Exit code 0

#### Test 6: Docker Stop with Short Timeout

Test behavior when Docker forces kill:

```bash
docker run -e TOKEN=$TOKEN --name test-bot regexybot-test &
sleep 5
docker stop -t 2 test-bot  # Only 2 seconds grace period
```

**Expected Result:**

- Bot attempts graceful shutdown
- If not complete in 2s, Docker sends SIGKILL
- This is acceptable behavior (document in production guidelines)

## CI/CD Testing

The GitHub Actions workflows include:

1. **PR Checks** (`.github/workflows/pr-checks.yml`):
   - Lint, format, typecheck
   - Unit tests
   - Docker build validation

2. **Push Checks** (`.github/workflows/push-checks.yml`):
   - Full test suite
   - Docker image build and push

3. **Manual Docker Testing:**

   ```bash
   # Build locally
   docker build -t regexybot:local .

   # Test run
   docker run --rm -e TOKEN=$TOKEN regexybot:local

   # Test stop
   docker stop <container_id>
   ```

## Exit Codes

The bot uses the following exit codes:

- **0** - Clean shutdown (SIGINT/SIGTERM handled properly)
- **1** - Fatal error or uncaught exception

## Troubleshooting

### Bot doesn't shut down gracefully

1. Check logs for "Starting graceful shutdown..." message
2. Verify worker pool shutdown completes
3. Check for hanging promises or unclosed connections

### Exit code is null

This usually means:

- Process was killed (SIGKILL) instead of terminated
- Docker grace period was too short
- Bot didn't respond to SIGTERM in time

### Tests are skipped

If shutdown tests are skipped:

- Set TOKEN environment variable: `export TOKEN=your_token_here`
- Or tests will be automatically skipped with a warning

## Production Deployment Checklist

Before deploying to production:

- [ ] Test graceful shutdown locally
- [ ] Test with Docker stop
- [ ] Verify exit codes are correct
- [ ] Document `--stop-timeout` if needed for your deployment
- [ ] Test with actual workload (queued tasks)
- [ ] Verify no data loss during shutdown

## Related Documentation

- [Docker README](docker/README.md) - Docker deployment guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development setup
