#!/bin/sh
set -e

mkdir -p /data

if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
  sed -i "s/\"mode\": \"token\"/\"mode\": \"token\", \"token\": \"$OPENCLAW_GATEWAY_TOKEN\"/" /app/config/openclaw.json
fi

cat /app/config/openclaw.json

exec node dist/index.js gateway --port 3000 --bind lan
