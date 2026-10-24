#!/usr/bin/env bash
# Starts the API on loopback:8002 against a dedicated local test database with no real service keys.
# Usage: scripts/run_isolated_test_api.sh   (credentials are written to $TEST_CREDS_FILE, mode 600)
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$BACKEND_DIR/../.venv/bin/python}"
PORT="${TEST_API_PORT:-8002}"
DB_NAME="${TEST_DB_NAME:-test_prizeleague}"
CREDS_FILE="${TEST_CREDS_FILE:-/tmp/prizeleague_test_creds.env}"

[[ "$DB_NAME" == test_* ]] || { echo "TEST_DB_NAME must start with test_" >&2; exit 1; }

if [[ ! -f "$CREDS_FILE" ]]; then
  umask 077
  rand() { "$PYTHON" -c 'import secrets;print(secrets.token_urlsafe(18))'; }
  {
    echo "TEST_ADMIN_EMAIL=admin@example.com"
    echo "TEST_ADMIN_PASSWORD=$(rand)Aa1!"
    echo "TEST_PLAYER_EMAIL=player1@example.com"
    echo "TEST_PLAYER_PASSWORD=$(rand)Aa1!"
    echo "TEST_BROKE_EMAIL=player_broke@example.com"
    echo "TEST_BOOTSTRAP_EMAIL=bootstrap@example.com"
    echo "TEST_BOOTSTRAP_PASSWORD=$(rand)Aa1!"
    echo "TEST_JWT_SECRET=$("$PYTHON" -c 'import secrets;print(secrets.token_urlsafe(48))')"
    echo "TEST_INSTANT_WIN_KEY=$("$PYTHON" -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"
  } > "$CREDS_FILE"
fi
chmod 600 "$CREDS_FILE"
set -a; source "$CREDS_FILE"; set +a

cd "$BACKEND_DIR"
exec env -i PATH="$PATH" HOME="${HOME:-/root}" \
  PYTHON_DOTENV_DISABLED=1 ENVIRONMENT=development \
  TEST_MODE=1 \
  TEST_NETWORK_LOOPBACK_ONLY=1 \
  MONGO_URL="mongodb://127.0.0.1:27017" DB_NAME="$DB_NAME" \
  JWT_SECRET="$TEST_JWT_SECRET" TEST_OTP_BYPASS_CODE=000000 INSTANT_WIN_KEY="${TEST_INSTANT_WIN_KEY:-test-instant-win-key}" \
  STRIPE_MODE=test STRIPE_SECRET_KEY=sk_test_pytest_only STRIPE_PUBLISHABLE_KEY=pk_test_pytest_only \
  STRIPE_WEBHOOK_SECRET=whsec_pytest_only ENABLE_MOCK_WALLET_TOPUP=true \
  "$PYTHON" -m uvicorn server:app --host 127.0.0.1 --port "$PORT"
