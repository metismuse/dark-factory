# BUILD STATUS — Dark Factory (pocketful)

**Last updated:** 2026-09-28 ~04:35 CDT · **Deadline:** Oct 6, 2026 1:59 AM CDT
(~8.5 days remaining) · **Spend:** $0.00 (all local compute + free tiers)

## Completion: ~40%

| Workstream | State |
|---|---|
| Factory scaffold (5 seats, mandates, FACTORY.md, SPEC.json, dispatch log) | DONE |
| Stage 1 — JSON API (`app/server.js`, `app/store.js`) | DONE — gated, provisional on spec names |
| Stage-1 gates: spec-warden 22/22 CONFORMS · golden suite 14/14 green · clean-boot (`unshare -rn`, zero outbound) verified | DONE (re-verified 2026-09-28: 14/14 green) |
| Stage 2 — Web UI (`data-testid`) | NOT STARTED — blocked on official spec |
| Stage 3 — Concurrency control (hardening beyond stage-1 suite) | NOT STARTED |
| Stage 4 — Domain extension | NOT STARTED |
| BAND account + real room + room export | NOT STARTED — blocked (parent browser task) |
| Demo video (script done; 4/7 shots captured) | PARTIAL — shots 1/4/5/7 done (real-run transcripts, PIL-rendered); 2/3 (room) + 6 (stage-2 UI) blocked |
| Public GitHub repo | DONE — https://github.com/metismuse/dark-factory (public; code + cover pushed 2026-09-28) |
| Cover image | DONE — video/cover.png (1280×720, 5 stations, pushed) |
| Slides, submission form | NOT STARTED |
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
   convention, self-transfer semantics. NO decision-independent workaround —
   building the UI on provisional names risks a full rework under the harness.
2. **BAND account + API key** (free, app.band.ai): blocks the real room, the
   room export (minimum eligibility), the room recording (video DQ item), and
   all Agent Teamwork evidence (25% of the score). This is the single biggest
   remaining risk.
3. **Band Desktop headless record / user-side room recording**: fallback is the
   user recording the room on their own machine (lablab docs are macOS/Linux).
4. **Submission** — user-confirmed; never autonomous.

## What's now done that was queued (2026-09-28 ~04:35 CDT run)
- GitHub repo is live with code: initial push (SSH `GIT_SSH_COMMAND` with
  `~/.ssh/id_github_metis` — works from this VM; the earlier "proxy-blocked"
  diagnosis was the root/ssh-config mismatch, now resolved).
- Cover image generated, committed, pushed (`video/cover.png`, 1280×720;
  `video/cover-provenance.json` holds the generation record).
- Golden suite re-verified green (14/14, 0 fail) post-push.
- Submission checklist item "Public GitHub repo" + "Cover image" are DONE.

## Decision-independent work remaining (mine, no blockers)
- Slide deck (5–7 slides: factory shape → stage-1 demo → gates → costs → next)
  — draftable from FACTORY.md + SHOT_LOG.md now.
- Video narration script timings vs captured shots (shot-4 is 34.9s in a 60s
  slot; shot-5 24.7s in a 30s slot) — assembly plan ready once shots 2/3/6 land.
- Autonomy audit prep: dispatch-log entries for stage 1 are recorded; stages
  2–4 need the same treatment at dispatch time.

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
