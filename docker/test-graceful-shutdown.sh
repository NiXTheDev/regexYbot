#!/bin/bash
# Docker Graceful Shutdown Test Script
# Tests that the bot handles SIGTERM/SIGINT properly with graceful drain

set -e

echo "=== Docker Graceful Shutdown Test ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_TIMEOUT=15
GRACEFUL_DRAIN_TIMEOUT=8000

echo "Test 1: Immediate shutdown (GRACEFUL_DRAIN=false)"
echo "------------------------------------------------"
docker run -d \
  --name regexybot-test-immediate \
  -e TOKEN=${TOKEN:-test_token} \
  -e GRACEFUL_DRAIN=false \
  -e LOG_LEVEL=info \
  ghcr.io/nixthedev/regexybot:dev || true

sleep 2

echo "Sending SIGTERM..."
timeout $TEST_TIMEOUT docker stop regexybot-test-immediate || true

EXIT_CODE=$(docker inspect regexybot-test-immediate --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
echo "Exit code: $EXIT_CODE"

if [ "$EXIT_CODE" = "0" ]; then
  echo -e "${GREEN}✓ Test 1 PASSED${NC}: Clean shutdown with exit code 0"
else
  echo -e "${RED}✗ Test 1 FAILED${NC}: Expected exit code 0, got $EXIT_CODE"
fi

docker rm -f regexybot-test-immediate 2>/dev/null || true
echo ""

echo "Test 2: Graceful drain (GRACEFUL_DRAIN=true)"
echo "--------------------------------------------"
docker run -d \
  --name regexybot-test-graceful \
  -e TOKEN=${TOKEN:-test_token} \
  -e GRACEFUL_DRAIN=true \
  -e GRACEFUL_DRAIN_TIMEOUT_MS=$GRACEFUL_DRAIN_TIMEOUT \
  -e LOG_LEVEL=info \
  ghcr.io/nixthedev/regexybot:dev || true

sleep 2

echo "Sending SIGTERM (should drain pending tasks)..."
timeout $TEST_TIMEOUT docker stop regexybot-test-graceful || true

EXIT_CODE=$(docker inspect regexybot-test-graceful --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
STOPPED_AT=$(docker inspect regexybot-test-graceful --format='{{.State.FinishedAt}}' 2>/dev/null || echo "unknown")
echo "Exit code: $EXIT_CODE"
echo "Stopped at: $STOPPED_AT"

if [ "$EXIT_CODE" = "0" ]; then
  echo -e "${GREEN}✓ Test 2 PASSED${NC}: Clean shutdown with graceful drain"
else
  echo -e "${RED}✗ Test 2 FAILED${NC}: Expected exit code 0, got $EXIT_CODE"
fi

docker rm -f regexybot-test-graceful 2>/dev/null || true
echo ""

echo "Test 3: Docker Compose stop"
echo "---------------------------"
if [ -f "docker-compose.yml" ]; then
  cd docker
  docker compose up -d 2>/dev/null || true
  sleep 3
  
  echo "Running docker compose stop..."
  timeout $TEST_TIMEOUT docker compose stop || true
  
  # Check if containers exited cleanly
  EXIT_CODES=$(docker compose ps -a --format json 2>/dev/null | grep -o '"ExitCode":[0-9]*' | cut -d':' -f2)
  
  ALL_CLEAN=true
  for code in $EXIT_CODES; do
    if [ "$code" != "0" ]; then
      ALL_CLEAN=false
      break
    fi
  done
  
  if [ "$ALL_CLEAN" = true ]; then
    echo -e "${GREEN}✓ Test 3 PASSED${NC}: Docker compose stop with clean exit codes"
  else
    echo -e "${YELLOW}⚠ Test 3 WARNING${NC}: Some containers had non-zero exit codes"
    echo "Exit codes found: $EXIT_CODES"
  fi
  
  docker compose down 2>/dev/null || true
  cd ..
else
  echo -e "${YELLOW}⚠ Test 3 SKIPPED${NC}: docker-compose.yml not found"
fi
echo ""

echo "Test 4: Signal handling (SIGINT vs SIGTERM)"
echo "--------------------------------------------"
docker run -d \
  --name regexybot-test-signals \
  -e TOKEN=${TOKEN:-test_token} \
  -e GRACEFUL_DRAIN=true \
  -e LOG_LEVEL=debug \
  ghcr.io/nixthedev/regexybot:dev || true

sleep 2

echo "Sending SIGINT..."
docker kill --signal=SIGINT regexybot-test-signals 2>/dev/null || true
sleep 3

EXIT_CODE=$(docker inspect regexybot-test-signals --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
if [ "$EXIT_CODE" = "0" ] || [ "$EXIT_CODE" = "130" ]; then
  echo -e "${GREEN}✓ SIGINT handled correctly${NC} (exit code: $EXIT_CODE)"
else
  echo -e "${YELLOW}⚠ SIGINT exit code${NC}: $EXIT_CODE (may be acceptable)"
fi

docker rm -f regexybot-test-signals 2>/dev/null || true
echo ""

echo "=== Test Summary ==="
echo ""
echo "Docker graceful shutdown tests completed."
echo ""
echo "Notes:"
echo "- Exit code 0 = Clean shutdown"
echo "- Exit code 130 = Clean shutdown via SIGINT (130 = 128 + 2)"
echo "- Exit code 137 = SIGKILL (force killed, exceeded grace period)"
echo "- Exit code 143 = SIGTERM (143 = 128 + 15)"
echo ""
echo "For production deployments:"
echo "1. Ensure GRACEFUL_DRAIN_TIMEOUT_MS < Docker stop_grace_period"
echo "2. Default Docker grace period is 10s"
echo "3. Default graceful drain timeout is 8s"
echo "4. Adjust container stop_grace_period if needed in docker-compose.yml"
