#!/usr/bin/env bash
#
# start-manager.sh — Lance le Service Manager (gestion multi-restaurants)
#
# Charge .env et lance service-manager en mode dev (tsx) ou prod (node).
# CTRL+C arrête proprement le manager + tous les agents.
#
# Usage :
#   ./start-manager.sh          # mode dev (tsx)
#   ./start-manager.sh --prod   # mode prod (node dist/)
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

# ── Mode dev / prod ──────────────────────────────────────

MODE="dev"
if [ "${1:-}" = "--prod" ]; then
    MODE="prod"
fi

echo "=== AlloResto Service Manager ==="
echo "  Mode:      $MODE"
echo "  Port API:  ${SERVICE_MANAGER_PORT:-8080}"
echo "  Next.js:   ${NEXT_API_URL:-http://localhost:3000}"
echo "  App base:  ${APP_BASE_PORT:-5050}"
echo "  Bridge:    ${BRIDGE_BASE_PORT:-5060}"
echo "  Max call:  ${MAX_CALL_DURATION:-600}s"
echo "=================================="
echo ""

if [ "$MODE" = "prod" ]; then
    if [ ! -f "$SCRIPT_DIR/dist/service-manager.js" ]; then
        echo "Build manquant — lancement de npm run build..."
        (cd "$SCRIPT_DIR" && npm run build)
    fi
    exec node "$SCRIPT_DIR/dist/service-manager.js"
else
    command -v npx >/dev/null 2>&1 || { echo "npx introuvable — installer Node.js"; exit 1; }
    export NODE_ENV=development
    exec npx tsx "$SCRIPT_DIR/service-manager.ts"
fi
