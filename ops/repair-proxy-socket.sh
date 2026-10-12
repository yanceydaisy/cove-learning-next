#!/usr/bin/env bash
set -euo pipefail
# One-time Caddy repair: switch Learning Next's private upstream to a shared Unix socket.
# Install this script root-owned before running; do not grant broad passwordless sudo.
if [[ "$(id -u)" != 0 ]]; then
  echo "Run as root after installing the script root-owned." >&2; exit 1
fi
ROOT=/home/ubuntu/projects/cove-learning-next
CADDY=/opt/cove/proxy/Caddyfile
UNIT=/etc/systemd/system/cove-learning-next.service
SOCKDIR=/opt/cove/data/caddy/data/learning-next
SOCKET="$SOCKDIR/learning.sock"
test -f "$ROOT/dist/src/server.js"
test -f "$ROOT/data/preview.env"
test -f "$CADDY"
test -f "$UNIT"
backup="$CADDY.pre-socket-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDY" "$backup"
install -d -o ubuntu -g ubuntu -m 0700 "$SOCKDIR"
# Update only this independent preview unit, never Home or original Learning units.
install -m 0644 "$ROOT/ops/cove-learning-next.service" "$UNIT"
systemctl daemon-reload
systemctl restart cove-learning-next.service
systemctl is-active --quiet cove-learning-next.service
for i in $(seq 1 20); do
  [[ -S "$SOCKET" ]] && break
  sleep 0.5
done
[[ -S "$SOCKET" ]] || { echo "No private socket; see journalctl -u cove-learning-next.service" >&2; exit 1; }
curl -fsS --max-time 5 --unix-socket "$SOCKET" http://learning/api/health >/dev/null 2>&1 && {
 echo "Warning: unauthenticated health succeeded unexpectedly" >&2; exit 1;
}
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 --unix-socket "$SOCKET" http://learning/api/health)"
[[ "$code" = "401" ]] || { echo "Expected private API auth (401), got $code" >&2; exit 1; }
# Patch only the known preview site's proxy target. Fail closed if it is not present.
python3 - "$CADDY" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1])
s=p.read_text()
start=s.find('learning-next.43.133.238.9.sslip.io {')
if start < 0: raise SystemExit("Learning Next Caddy block missing")
end=s.find('\n}',start)
if end < 0: raise SystemExit("Learning Next Caddy block malformed")
block=s[start:end+2]
old='reverse_proxy 172.18.0.1:18982'
new='reverse_proxy unix//data/learning-next/learning.sock'
if new in block:
    print('Caddy upstream already uses a Unix socket.')
elif block.count(old)==1:
    p.write_text(s[:start]+block.replace(old,new)+s[end+2:])
else:
    raise SystemExit("Unexpected upstream; refusing unrelated Caddy edits")
PY
if ! docker exec cove-caddy test -S /data/learning-next/learning.sock; then
  echo "Caddy cannot see the preview Unix socket." >&2
  cp -p "$backup" "$CADDY"
  exit 1
fi
if ! docker exec cove-caddy caddy validate --config /etc/caddy/Caddyfile; then
  cp -p "$backup" "$CADDY"; echo "Invalid Caddy config; restored previous file." >&2; exit 1
fi
if ! docker exec cove-caddy caddy reload --config /etc/caddy/Caddyfile; then
  cp -p "$backup" "$CADDY"
  docker exec cove-caddy caddy reload --config /etc/caddy/Caddyfile || true
  echo "Caddy reload failed, previous file restored." >&2
  exit 1
fi
printf 'Private socket is active. HTTPS target: https://learning-next.43.133.238.9.sslip.io/\n'
