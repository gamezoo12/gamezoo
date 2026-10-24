#!/usr/bin/env bash
# Runs the backend pytest suite against the isolated loopback API started by run_isolated_test_api.sh.
# Usage: scripts/run_isolated_backend_tests.sh [pytest args]   (same TEST_DB_NAME / TEST_CREDS_FILE as the API)
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$BACKEND_DIR/../.venv/bin/python}"
export TEST_DB_NAME="${TEST_DB_NAME:-test_prizeleague}"
export TEST_CREDS_FILE="${TEST_CREDS_FILE:-/tmp/prizeleague_test_creds.env}"

[[ "$TEST_DB_NAME" == test_* ]] || { echo "TEST_DB_NAME must start with test_" >&2; exit 1; }
[[ -f "$TEST_CREDS_FILE" ]] || { echo "Missing $TEST_CREDS_FILE; start run_isolated_test_api.sh first" >&2; exit 1; }

set -a; source "$TEST_CREDS_FILE"; set +a
export TEST_BACKEND_ISOLATED=1 TEST_BACKEND_URL="http://127.0.0.1:${TEST_API_PORT:-8002}" TEST_MONGO_URL="mongodb://127.0.0.1:27017"
# Must mirror the API runner so tests that depend on the dev mock top-up skip correctly.
export ENABLE_MOCK_WALLET_TOPUP=true

cd "$BACKEND_DIR"
exec "$PYTHON" -m pytest "$@"
