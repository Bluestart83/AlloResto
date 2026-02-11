#!/usr/bin/env bash
#
# start-manager.sh — Lance le Service Manager (gestion multi-restaurants)
#
# Charge .env et lance service-manager.ts via tsx.
# CTRL+C arrête proprement le manager + tous les agents.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Charger .env ─────────────────────────────────────────

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# ── Vérifications ──────────────────────────────────────────

: "${OPENAI_API_KEY:?OPENAI_API_KEY requis dans .env}"

command -v npx >/dev/null 2>&1 || { echo "npx introuvable — installer Node.js"; exit 1; }

# ── Lancement ──────────────────────────────────────────────

echo "=== AlloResto Service Manager ==="
echo "  Port API:  ${SERVICE_MANAGER_PORT:-8090}"
echo "  Next.js:   ${NEXT_API_URL:-http://localhost:3000}"
echo "  App base:  ${APP_BASE_PORT:-5050}"
echo "  Bridge:    ${BRIDGE_BASE_PORT:-5060}"
echo "  Max call:  ${MAX_CALL_DURATION:-600}s"
echo "=================================="
echo ""

exec npx tsx "$SCRIPT_DIR/service-manager.ts"
