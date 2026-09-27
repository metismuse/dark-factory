# BUILD STATUS — Dark Factory (pocketful)

**Last updated:** 2026-09-27 ~08:15 CDT · **Deadline:** Oct 6, 2026 1:59 AM CDT
(9 days, ~17.5 h remaining) · **Spend:** $0.00 (all local compute + free tiers)

## Completion: ~30%

| Workstream | State |
|---|---|
| Factory scaffold (5 seats, mandates, FACTORY.md, SPEC.json, dispatch log) | DONE |
| Stage 1 — JSON API (`app/server.js`, `app/store.js`) | DONE — gated, provisional on spec names |
| Stage-1 gates: spec-warden 22/22 CONFORMS · golden suite 14/14 green · clean-boot (`unshare -rn`, zero outbound) verified | DONE |
| Stage 2 — Web UI (`data-testid`) | NOT STARTED — blocked on official spec |
| Stage 3 — Concurrency control (hardening beyond stage-1 suite) | NOT STARTED |
| Stage 4 — Domain extension | NOT STARTED |
| BAND account + real room + room export | NOT STARTED — blocked (parent browser task) |
| Demo video (script done; room-recording shots blocked) | SCRIPT DONE — capture blocked |
| Public GitHub repo | NOT STARTED — doable now via metismuse account |
| Cover image, slides, submission form | NOT STARTED |
| Submission to lablab.ai | NOT DONE — user-confirmed action |

## What the autonomous scope delivered today

- Zero-dependency service: `app/store.js` (async Mutex ledger, integer minor
  units, SHA-256 idempotency keys, durable commit before mutation) and
  `app/server.js` (HTTP routing, documented error envelope, exportable for tests).
- `tests/golden.test.js` — 14 tests, all green: wallet CRUD, transfer happy
  path, 422/404/400/409/405 matrix, idempotent replay, concurrent same-key race
  (moves money once), 500-transfer conservation storm (total preserved,
  no negative balances), malformed JSON → 400.
- `factory/conformance-check.js` — executable spec-warden: 22 CONFORMS,
  0 DEVIATES, 2 SKIPPED (the two blocked on the official spec).
- `SPEC.json` — provisional conformance checklist, every exact name marked
  provisional until locked against the official track spec.
- `FACTORY.md` — the factory description (setup, rationale, measured costs,
  bad-work recovery incl. the replay-status incident).
- `factory/dispatch-log.md` — the stage-1 dispatch recorded (the human-input
  boundary for the autonomy rubric).
- `video/VIDEO_SCRIPT.md` — shot list + verbatim narration; room-recording
  shots marked BLOCKED per the DQ rule.

## Blockers (all parent-owned; NOT pursued further by this subagent)

1. **Official track spec** (lablab.ai session): exact endpoints, field names,
   status codes, `data-testid` values, CPU/mem caps, deadline timezone.
   Blocks: stage 2 UI, locking SPEC.json names, the 409/200 replay-status
   convention, self-transfer semantics.
2. **BAND account + API key** (free, app.band.ai; brief assigns account limits
   to parent): blocks the real room, the room export (minimum eligibility),
   and the room recording (video DQ item).
3. **Band Desktop download + headless record**: fallback is the user recording
   the room on their own machine.
4. **Public GitHub repo** for the project (metismuse account exists; creation
   + push are within standing authority — queued for a later run).
5. **Submission** — user-confirmed; never autonomous.

## Submission checklist (final run, in order)

- [ ] Official track spec in hand; SPEC.json locked; any provisional name updated
- [ ] Stages 1–4 each: builder delivered → spec-warden CONFORMS → race-hunter
      clean → regression-guard green ≥ baseline → architect APPROVED (dispatch
      log entries for each)
- [ ] Clean-boot test passes (network-isolated container, zero outbound)
- [ ] BAND room export attached
- [ ] Video: room recording + walkthrough present
- [ ] Public GitHub repo linked
- [ ] Cover image + slides uploaded
- [ ] Mandates re-verified track-generic (no track-specific detail in `seats/`)
- [ ] Factory description submitted
- [ ] **User confirms → submit on lablab.ai** (never autonomous)

## Immediate next steps (priority order)

1. Parent pulls the official track spec from lablab.ai → lock SPEC.json → stage 2 UI dispatch.
2. Parent creates the BAND account → API key → real room with the 5 seats → room export procedure documented in FACTORY.md.
3. Push the repo to a public GitHub repo under metismuse.
4. Stage 2–4 dispatches, one at a time, each recorded in the dispatch log.
5. Record/capture the video shots that don't need the room (shots 1, 4, 5, 7).
