#!/bin/bash
# Setup coturn TURN/STUN server on VPS
# Usage: sudo bash setup_coturn.sh

set -e

PUBLIC_IP=$(curl -s ifconfig.me)
TURN_USER="${TURN_USERNAME:-voiceorder}"
TURN_PASS="${TURN_PASSWORD:-$(openssl rand -hex 16)}"

echo "=== Installing coturn ==="
apt-get update && apt-get install -y coturn

echo "=== Configuring coturn ==="
cat > /etc/turnserver.conf << EOF
listening-port=3478
realm=voiceorder.ai
server-name=voiceorder.ai
external-ip=$PUBLIC_IP
min-port=49152
max-port=65535
user=$TURN_USER:$TURN_PASS
lt-cred-mech
fingerprint
no-cli
no-tlsv1
no-tlsv1_1
EOF

echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn

echo "=== Configuring firewall ==="
ufw allow 5060/udp     # SIP
ufw allow 3478/tcp     # TURN
ufw allow 3478/udp     # STUN
ufw allow 10000:20000/udp   # RTP
ufw allow 49152:65535/udp   # TURN relay

systemctl enable coturn
systemctl restart coturn

echo ""
echo "=== coturn OK ==="
echo "Public IP:  $PUBLIC_IP"
echo "TURN User:  $TURN_USER"
echo "TURN Pass:  $TURN_PASS"
echo ""
echo "Add to .env:"
echo "  TURN_SERVER=$PUBLIC_IP:3478"
echo "  TURN_USERNAME=$TURN_USER"
echo "  TURN_PASSWORD=$TURN_PASS"
