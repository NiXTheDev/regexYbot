# Docker Deployment for regexYbot

This directory contains Docker Compose configuration for deploying regexYbot.

## Quick Start

1. Copy `docker-compose.yml` to your deployment directory:

   ```bash
   cp docker-compose.yml ~/deploy/
   cd ~/deploy
   ```

2. Set your bot token:

   ```bash
   export TOKEN=your_bot_token_here
   ```

3. Uncomment a healthcheck option in `docker-compose.yml` (see below)

4. Start the bot:
   ```bash
   docker compose up -d
   ```

## Healthcheck Options

Docker needs a way to determine if your container is healthy. regexYbot supports
4 healthcheck options - choose one based on your needs:

| Option            | Pros                      | Cons                   | Recommended For            |
| ----------------- | ------------------------- | ---------------------- | -------------------------- |
| **1. Process**    | Simple, offline           | Can't detect deadlocks | Development, simple setups |
| **2. API**        | Tests network + token     | Can't detect deadlocks | Most production setups     |
| **3. Combined**   | Catches crashes + network | Slightly complex       | Robust production          |
| **4. File-based** | Detects deadlocks         | Requires env var       | High-availability setups   |

### Option 1: Process Check (Simplest)

Verifies the `bun` process is running. Good for development.

```yaml
healthcheck:
  test: ["CMD", "pgrep", "-x", "bun"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

### Option 2: API Check (Most Common)

Makes a request to Telegram's `getMe` endpoint. Verifies:

- Process is running
- Network is working
- Bot token is valid

```yaml
healthcheck:
  test:
    [
      "CMD-SHELL",
      "curl -f ${BASE_URL:-https://api.telegram.org}/bot${TOKEN}/getMe || exit 1",
    ]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s
```

Works with custom `BASE_URL` if you're using a self-hosted API server.

### Option 3: Combined (Robust)

Checks both process AND API. Best for production.

```yaml
healthcheck:
  test:
    [
      "CMD-SHELL",
      "pgrep -x bun > /dev/null && curl -f ${BASE_URL:-https://api.telegram.org}/bot${TOKEN}/getMe > /dev/null 2>&1 || exit 1",
    ]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s
```

### Option 4: File-based (Deadlock Detection)

The only option that detects if the bot's event loop is stuck (deadlocked).
Requires two changes:

1. Uncomment the environment variable:

   ```yaml
   environment:
     - ENABLE_FILE_HEALTHCHECK=true
   ```

2. Uncomment the healthcheck:
   ```yaml
   healthcheck:
     test:
       [
         "CMD-SHELL",
         "test $(($(date +%s) - $(cat /tmp/bot-alive 2>/dev/null || echo 0))) -lt 60 || exit 1",
       ]
     interval: 30s
     timeout: 5s
     retries: 3
     start_period: 20s
   ```

The bot will write a timestamp to `/tmp/bot-alive` every 30 seconds. The healthcheck
fails if the file hasn't been updated in 60 seconds.

## Environment Variables

| Variable                  | Required | Default                    | Description                              |
| ------------------------- | -------- | -------------------------- | ---------------------------------------- |
| `TOKEN`                   | Yes      | -                          | Your Telegram bot token                  |
| `BASE_URL`                | No       | `https://api.telegram.org` | Custom Telegram API server               |
| `ENABLE_FILE_HEALTHCHECK` | No       | -                          | Set to "true" for file-based healthcheck |
| `LIVENESS_FILE`           | No       | `/tmp/bot-alive`           | Path for liveness file                   |
| `LIVENESS_INTERVAL_MS`    | No       | `30000`                    | How often to update liveness file        |

## Troubleshooting

### Healthcheck fails immediately

- Check that `TOKEN` is set correctly
- Ensure network connectivity (for API-based checks)
- Verify `BASE_URL` is reachable (if using custom API)

### Healthcheck passes but bot doesn't respond

- Check logs: `docker compose logs regexybot`
- Verify webhook/TOKEN configuration in Telegram

### File-based healthcheck fails

- Ensure `ENABLE_FILE_HEALTHCHECK=true` is set
- Check that `/tmp` is writable inside the container
- Increase `start_period` if bot takes longer to start

## Building Custom Image

To build your own image with specific healthcheck enabled by default:

```dockerfile
FROM ghcr.io/nixthedev/regexybot:latest
ENV ENABLE_FILE_HEALTHCHECK=true
```
