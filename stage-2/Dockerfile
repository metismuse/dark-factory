# pocketful stage 2 — zero-dependency Node.js service.
# Build: docker build -t pocketful-stage2 .
# Run:   docker run --rm -p 8080:8080 pocketful-stage2
FROM node:24-alpine
WORKDIR /srv
COPY src/ ./src/
ENV POCKETFUL_STAGE=2
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12   CMD wget -qO- http://127.0.0.1:${PORT:-8080}/health || exit 1
CMD ["node", "src/server.js"]
