#!/usr/bin/env bash
#
# test.sh — Lance le proxy vocal (app.ts) + le SIP bridge (si pjsua2 dispo)
#
# Les deux process tournent en parallèle. CTRL+C arrête tout.
#
# Variables d'environnement requises :
#   OPENAI_API_KEY    — clé API OpenAI
#   RESTAURANT_ID     — ID du restaurant
#
# Variables optionnelles (SIP bridge) :
#   SIP_USERNAME      — username SIP (bridge lancé seulement si défini)
#   Voir start-sipbridge.sh pour les autres
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

: "${OPENAI_API_KEY:?OPENAI_API_KEY requis}"
: "${RESTAURANT_ID:?RESTAURANT_ID requis}"

command -v npx >/dev/null 2>&1 || { echo "npx introuvable — installer Node.js"; exit 1; }

# ── Config app.ts ──────────────────────────────────────────

APP_PORT="${PORT:-5050}"
NEXT_API_URL="${NEXT_API_URL:-http://localhost:3000}"

# ── Trap : CTRL+C tue tout ───────────────────────────────

PIDS=()

cleanup() {
    echo ""
    echo "Arrêt..."
    # Kill entire process groups (negative PID) to catch child processes
    for pid in "${PIDS[@]}"; do
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    done
    for pid in "${PIDS[@]}"; do
        wait "$pid" 2>/dev/null || true
    done
    echo "Terminé."
}
trap cleanup EXIT INT TERM

# Run children in their own process groups so we can kill the whole tree
set -m

# ── Lancement app.ts (proxy vocal OpenAI) ─────────────────

echo "▶ app.ts (port $APP_PORT)"
PORT="$APP_PORT" \
NEXT_API_URL="$NEXT_API_URL" \
RESTAURANT_ID="$RESTAURANT_ID" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
    npx tsx "$SCRIPT_DIR/app.ts" &
PIDS+=($!)

# ── Lancement SIP bridge (optionnel) ─────────────────────

if [ -n "${SIP_USERNAME:-}" ]; then
    sleep 2
    echo "▶ sipbridge (SIP: $SIP_USERNAME)"
    "$SCRIPT_DIR/start-sipbridge.sh" &
    PIDS+=($!)
else
    echo "ℹ SIP_USERNAME non défini — mode Twilio uniquement"
fi

# ── Attendre ───────────────────────────────────────────────

wait "${PIDS[@]}"
