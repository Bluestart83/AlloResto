#!/usr/bin/env bash
#
# start-sipbridge.sh — Lance le SIP Bridge pour AlloResto
#
# Configure les paramètres SIP et lance le bridge.
# Les valeurs peuvent être overridées via variables d'environnement.
#
# Usage :
#   ./start-sipbridge.sh
#   SIP_USERNAME=autre_user ./start-sipbridge.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Valeurs par défaut (override via env) ──────────────────

SIP_DOMAIN="${SIP_DOMAIN:-sip.twilio.com}"
SIP_USERNAME="${SIP_USERNAME:?SIP_USERNAME requis}"
SIP_PASSWORD="${SIP_PASSWORD:-}"
SIP_PORT="${SIP_PORT:-0}"
SIP_TRANSPORT="${SIP_TRANSPORT:-udp}"

STUN_SERVER="${STUN_SERVER:-}"
TURN_SERVER="${TURN_SERVER:-}"
TURN_USERNAME="${TURN_USERNAME:-}"
TURN_PASSWORD="${TURN_PASSWORD:-}"

WS_TARGET="${WS_TARGET:-ws://localhost:5050/media-stream}"
BRIDGE_API_PORT="${BRIDGE_API_PORT:-5060}"
RESTAURANT_ID="${RESTAURANT_ID:?RESTAURANT_ID requis}"

STATUS_CALLBACK_URL="${STATUS_CALLBACK_URL:-}"
INCOMING_CALLBACK_URL="${INCOMING_CALLBACK_URL:-}"

MAX_CALL_DURATION="${MAX_CALL_DURATION:-600}"
MAX_CONCURRENT_CALLS="${MAX_CONCURRENT_CALLS:-10}"

# ── Construction de la commande ────────────────────────────

CMD=(
    python "$SCRIPT_DIR/main-sipbridge.py"
    --sip-domain "$SIP_DOMAIN"
    --sip-username "$SIP_USERNAME"
    --sip-transport "$SIP_TRANSPORT"
    --sip-port "$SIP_PORT"
    --ws-target "$WS_TARGET"
    --api-port "$BRIDGE_API_PORT"
    --max-call-duration "$MAX_CALL_DURATION"
    --max-concurrent-calls "$MAX_CONCURRENT_CALLS"
    --param "restaurantId=$RESTAURANT_ID"
)

[ -n "$SIP_PASSWORD" ]          && CMD+=(--sip-password "$SIP_PASSWORD")
[ -n "$STUN_SERVER" ]           && CMD+=(--stun-server "$STUN_SERVER")
[ -n "$TURN_SERVER" ]           && CMD+=(--turn-server "$TURN_SERVER")
[ -n "$TURN_USERNAME" ]         && CMD+=(--turn-username "$TURN_USERNAME")
[ -n "$TURN_PASSWORD" ]         && CMD+=(--turn-password "$TURN_PASSWORD")
[ -n "$STATUS_CALLBACK_URL" ]   && CMD+=(--status-callback-url "$STATUS_CALLBACK_URL")
[ -n "$INCOMING_CALLBACK_URL" ] && CMD+=(--incoming-callback-url "$INCOMING_CALLBACK_URL")

echo "▶ ${CMD[*]}"
exec "${CMD[@]}"
