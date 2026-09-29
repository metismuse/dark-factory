# pocketful — stage 3: build and run

## Build

```bash
docker build -t pocketful-stage3 .
```

The image is self-contained: zero npm dependencies, no build step, no
outbound network needed at build or run time beyond the base image pull.

## Run

```bash
docker run --rm -p 8080:8080 pocketful-stage3
```

The service listens on `0.0.0.0`, port `$PORT` (default `8080`):

```bash
docker run --rm -e PORT=9000 -p 9000:9000 pocketful-stage3
```

## Health

```bash
curl localhost:8080/health   # {"ok":true,"stage":3}
```

Startup to healthy is a few seconds (well under the 60s limit).

## Notes

- This folder is a complete stage-3 service: `src/server.js` + `src/ledger.js`
  (+ `src/ui.js` for stages 2+). The stage is pinned by the Dockerfile's
  `POCKETFUL_STAGE=3`; a stage-3 image serves exactly the stage-3 API.
- Reset/seed for tests: `POST /_test/reset` (unauthenticated, 204).
