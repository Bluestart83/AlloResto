#!/usr/bin/env bash
#
# start.sh — Lance le proxy vocal (app.py) + le SIP bridge (sipbridge)
#
# Les deux process tournent en parallèle. CTRL+C arrête tout.
#
# Variables d'environnement requises :
#   OPENAI_API_KEY    — clé API OpenAI
#   RESTAURANT_ID     — ID du restaurant
#   SIP_USERNAME      — username SIP
#
# Variables optionnelles : voir start-sipbridge.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Vérifications ──────────────────────────────────────────

: "${OPENAI_API_KEY:?OPENAI_API_KEY requis}"
: "${RESTAURANT_ID:?RESTAURANT_ID requis}"
: "${SIP_USERNAME:?SIP_USERNAME requis}"

# ── Config app.py ──────────────────────────────────────────

APP_PORT="${PORT:-5050}"
NEXT_API_URL="${NEXT_API_URL:-http://localhost:3000}"

# ── Trap : CTRL+C tue les deux process ────────────────────

cleanup() {
    echo ""
    echo "Arrêt..."
    kill $PID_APP $PID_BRIDGE 2>/dev/null || true
    wait $PID_APP $PID_BRIDGE 2>/dev/null || true
    echo "Terminé."
}
trap cleanup EXIT INT TERM

# ── Lancement app.py (proxy vocal OpenAI) ─────────────────

echo "▶ app.py (port $APP_PORT)"
PORT="$APP_PORT" \
NEXT_API_URL="$NEXT_API_URL" \
RESTAURANT_ID="$RESTAURANT_ID" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
    python "$SCRIPT_DIR/app.py" &
PID_APP=$!

# Attendre que app.py soit prêt
sleep 2

# ── Lancement SIP bridge ──────────────────────────────────

echo "▶ sipbridge (SIP: $SIP_USERNAME)"
"$SCRIPT_DIR/start-sipbridge.sh" &
PID_BRIDGE=$!

# ── Attendre ───────────────────────────────────────────────

wait $PID_APP $PID_BRIDGE
