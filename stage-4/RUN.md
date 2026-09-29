# pocketful — stage 4: build and run

## Build

```bash
docker build -t pocketful-stage4 .
```

The image is self-contained: zero npm dependencies, no build step, no
outbound network needed at build or run time beyond the base image pull.

## Run

```bash
docker run --rm -p 8080:8080 pocketful-stage4
```

The service listens on `0.0.0.0`, port `$PORT` (default `8080`):

```bash
docker run --rm -e PORT=9000 -p 9000:9000 pocketful-stage4
```

## Health

```bash
curl localhost:8080/health   # {"ok":true,"stage":4}
```

Startup to healthy is a few seconds (well under the 60s limit).

## Notes

- This folder is a complete stage-4 service: `src/server.js` + `src/ledger.js`
  (+ `src/ui.js` for stages 2+). The stage is pinned by the Dockerfile's
  `POCKETFUL_STAGE=4`; a stage-4 image serves exactly the stage-4 API.
- Reset/seed for tests: `POST /_test/reset` (unauthenticated, 204).
