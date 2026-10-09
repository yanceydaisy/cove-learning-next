#!/usr/bin/env bash
set -euo pipefail
# One-time privileged deployment of a separate, TLS-terminated Learning Next preview.
# Existing Home and old Learning services, application code and databases are untouched.
if [[ "$(id -u)" != 0 ]]; then
  echo "Run this one-time installer with sudo; the remote development agent has no elevated permissions." >&2
  exit 1
fi
APP=/home/ubuntu/projects/cove-learning-next
UNIT=/etc/systemd/system/cove-learning-next.service
CADDY=/opt/cove/proxy/Caddyfile
DOMAIN=learning-next.43.133.238.9.sslip.io
test -f "$APP/data/preview.env"
test -f "$APP/dist/src/server.js"
test -f "$CADDY"
if [[ -e "$UNIT" ]] && ! grep -q 'Cove Learning Next' "$UNIT"; then
  echo "Refusing to replace a pre-existing unrelated unit." >&2
  exit 1
fi
backup="$CADDY.before-learning-next-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDY" "$backup"
install -m 644 "$APP/ops/cove-learning-next.service" "$UNIT"
systemctl daemon-reload
systemctl enable --now cove-learning-next.service
systemctl is-active --quiet cove-learning-next.service || { echo "App service failed; not modifying Caddy." >&2; exit 1; }
if ! grep -Fq "$DOMAIN {" "$CADDY"; then
cat >> "$CADDY" <<'CADDY_BLOCK'

learning-next.43.133.238.9.sslip.io {
    header X-Robots-Tag "noindex, nofollow"
    encode gzip
    reverse_proxy 172.18.0.1:18982
}
CADDY_BLOCK
fi
if ! docker exec cove-caddy caddy validate --config /etc/caddy/Caddyfile; then
  cp -p "$backup" "$CADDY"
  echo "Caddy validation failed. Config restored to $backup." >&2
  exit 1
fi
if ! docker exec cove-caddy caddy reload --config /etc/caddy/Caddyfile; then
  cp -p "$backup" "$CADDY"
  docker exec cove-caddy caddy reload --config /etc/caddy/Caddyfile || true
  echo "Caddy reload failed. Config restored to $backup." >&2
  exit 1
fi
printf '\nCove Learning Next is routed at: https://%s/\n' "$DOMAIN"
echo "Wait for Caddy's HTTPS certificate before opening. Existing Home and old Learning remain unchanged."
