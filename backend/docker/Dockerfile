FROM ghcr.io/openclaw/openclaw:latest

COPY config.yaml /etc/openclaw/config.yaml

ENV OPENCLAW_CONFIG=/etc/openclaw/config.yaml
ENV OPENCLAW_STATE_DIR=/data

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js", "gateway", "--port", "3000", "--bind", "lan"]
