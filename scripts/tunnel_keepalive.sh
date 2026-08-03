#!/bin/bash
# Keep a cloudflared quick-tunnel alive. Restarts it whenever the public URL
# stops responding and records the current URL to /tmp/poolbet_tunnel_url.txt.
LOG=/tmp/poolbet_tunnel.log
URLFILE=/tmp/poolbet_tunnel_url.txt

start() {
  pkill -f "cloudflared tunnel --url http://localhost:8000" 2>/dev/null
  sleep 2
  cloudflared tunnel --url http://localhost:8000 >"$LOG" 2>&1 &
  for _ in $(seq 1 20); do
    u=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | grep -v '://api\.' | head -1)
    if [ -n "$u" ]; then echo "$u" >"$URLFILE"; echo "[keepalive] up: $u"; return; fi
    sleep 2
  done
}

start
while true; do
  sleep 25
  u=$(cat "$URLFILE" 2>/dev/null)
  code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$u/health" 2>/dev/null)
  if [ -z "$u" ] || [ "$code" != "200" ]; then
    echo "[keepalive] tunnel down (code=$code) — restarting"
    start
  fi
done
