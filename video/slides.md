# Slide deck draft — Dark Factory (pocketful) · lablab.ai submission
**Date:** 2026-09-28 · Export to PDF/slides at final assembly (Day 8 per BUILD_PLAN).
Source of truth: FACTORY.md, SPEC.json, SHOT_LOG.md, VIDEO_SCRIPT.md.

## 1 — Title
**pocketful — a software factory in BAND Desktop**
Dark Factory AI Hackathon · lablab.ai · solo entry
A band of 5 coding agents that plans work, implements it, and checks its own results.

## 2 — The factory shape (the actual entry is the factory, not the app)
Five seats, each with a generic, reusable mandate:
- **architect** — plans the work (only seat that designs)
- **builder** — the only seat that writes production code
- **spec-warden** — gates every deliverable against the track spec (executable conformance: 22 CONFORMS, 0 DEVIATES)
- **race-hunter** — finds concurrency and adversarial failure modes
- **regression-guard** — baselines the golden suite; nothing ships below baseline
Mandates stay track-generic by construction (track-specific detail = DQ).

## 3 — What it built: pocketful (stage 1, complete)
Zero-dependency wallet-and-payments JSON API: wallet CRUD, transfers with
idempotency keys (SHA-256), integer minor units, durable commit before mutation.
Async-mutex ledger; 500-transfer conservation storm; concurrent same-key replay
moves money exactly once.

## 4 — How it checks its own work
- **Executable spec-warden:** `factory/conformance-check.js` — every spec claim is code, not prose.
- **Golden suite:** 14 tests, 14 green — 422/404/400/409/405 matrix, malformed JSON, idempotent replay, conservation storm.
- **Clean-container gate:** boots under `unshare -rn` with zero outbound network (verified — doesn't start = scores zero, so we proved it starts).
- **Bad-work recovery:** the replay-status incident is documented in FACTORY.md — how the factory caught, diagnosed, and fixed its own misfire.

## 5 — Measured costs
Inference: free tiers only (NVIDIA NIM cascade → OpenRouter free → Mistral → Gemini). $0 spend total.
Everything ran locally; the repo's full provenance (dispatch log, shot log, test runs) ships with the submission.

## 6 — Autonomy evidence (Agent Teamwork = 25%)
In the submitted run, the dispatched task per stage was the only human input —
no steering, no approvals, no reruns. Dispatch log: `factory/dispatch-log.md`.
Review changed things (the replay-status fix traces to the spec-warden's review,
not to a human).

## 7 — What's next
Stage 2 (responsive UI with exact `data-testid`), stage 3 (concurrency hardening),
stage 4 (domain extension) — the factory is reusable: hand the same five
mandates a different problem and the same shape of work comes out.
