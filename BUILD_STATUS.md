# BUILD STATUS — Dark Factory (pocketful)

**Last updated:** 2026-09-29 ~06:00 CDT · **Deadline:** Oct 6, 2026 1:59 AM CDT
(~7 days remaining) · **Spend:** $0.00 (all local compute + free tiers)

## Completion: ~90%

| Workstream | State |
|---|---|
| Factory scaffold (5 seats, mandates, FACTORY.md, SPEC.json, dispatch log) | DONE — mandates carry `Harness: band-sdk` + `Model: openai/gpt-oss-20b` (first two lines); `mandates/` mirrors `seats/` for submission |
| **Official-spec rebuild** (`build/src/{server,ledger,ui}.js`, zero-dep Node) | DONE 2026-09-29 — written against `/tmp/df-spec/pocketful/spec/stage-{1..4}.md` |
| stage-1/…/stage-4/ folders (Dockerfile + RUN.md each, POCKETFUL_STAGE-pinned) | DONE — `build/assemble.sh` copies canonical src; overshoot gates verified (stage-1 404s all stage-2+ routes) |
| Stage-1 conformance | **147/147 shipped pytest checks green** (2026-09-29) |
| Stage-2 conformance | API sample green; **UI browser suite 25/25 green** (2026-09-29, local Chromium vs stage-4 server) |
| Repo test suites | **REWRITTEN** `tests/official.test.js` (node:test, zero-dep): **15/15 green** — stages 1–4 API + overshoot gates + race storms (same-key ×25, overdraft ×20, pay/decline race) |
| Stage-3 conformance | **6/6 sample green** (2026-09-29) |
| Stage-4 conformance | **5/5 sample green** (2026-09-29) |
| SPEC.json | REWRITTEN to the official pocketful contract (provisional wallet/deposit API retired) |
| Demo video | PARTIAL — shots 1/4/5/7 done; room recording blocked on gate-2 traffic; shot 6 (stage-2 UI) now unblocked |
| Public GitHub repo | DONE — https://github.com/metismuse/dark-factory (public); rebuild NOT yet pushed |
| Submission to lablab.ai | NOT DONE — user-confirmed action |
| room.json export | PENDING — user-side (Band console → download full session) |
| Gate-2 (seat-to-seat traffic) | PENDING — needs one parent-posted @mention to kick off handoffs |

## Rebuild notes (2026-09-29 ~06:00 CDT)
- Old layout (`app/server.js`, `app/store.js`, `tests/*.test.js`, `factory/conformance-check.js`) is
  retired in place; the graded build is `build/src/` + `stage-N/`.
- Conformance was run with the shipped suites directly:
  `python -m pytest pocketful/test/stage_N --base-url=http://127.0.0.1:8080 -p harness.plugin`
  (with the `NO_PROXY=localhost,127.0.0.1` workaround for the VM's httpx/proxy quirk).
- Fixes found by the suites: `/me` exposes `minor_units`; fixture `minor_units` defaults from
  currency (JPY→0, BHD→3); `/activity` ignores request-only params (200); seeded fixtures accept
  `*_user_id`/`id` keys; missing `to_handle` is 422; export is 200.
- `docker run` cannot be verified on this VM (sandbox blocks `setns`); the Dockerfile is written
  for the graded env and follows the standard `node:24-alpine` pattern. Document, don't re-verify.
- Scrypt logins (~130ms) make the full stage-1 suite take ~3 min; graded env should be similar.

| Workstream | State |
|---|---|
| Factory scaffold (5 seats, mandates, FACTORY.md, SPEC.json, dispatch log) | DONE |
| Stage 1 — JSON API (`app/server.js`, `app/store.js`) | DONE — gated, provisional on spec names |
| Stage-1 gates: spec-warden 27/27 CONFORMS · suites 33/33 green · clean-boot (`unshare -rn`, zero outbound) verified | DONE (re-verified 2026-09-29 post stage-2: 27/27 CONFORMS, 0 SKIPPED) |
| Stage 2 — Web UI (`data-testid`) | DONE — `app/ui.html` served at GET / (200, text/html), 17 provisional data-testids, 6/6 suite green; testid VALUES still provisional — rename to official spec at lock |
| Stage 3 — Concurrency hardening (`tests/race.test.js`) | DONE — 8/8 green: overdraft storm, key races, adversarial inputs |
| Stage 4 — Domain extension (wallet statement + deposit lookup) | DONE — 5/5 green, provisional names |
| BAND account + real room + room export | IN PROGRESS — account exists ("Metis Borne" / metismuse@siteborne.net, signed in, role User; created 2026-09-27, verified live 2026-09-28 ~22:58 CDT). REST API key "metis-dark-factory" ACTIVE (created Sep 27, last-4 b2be); second key "metis-dark-factory-cli" created Sep 28 (recreated after the first reveal dialog was closed before capture). **REAL ROOM CREATED 2026-09-29 ~04:10 UTC via POST /api/v1/me/chats (user key, X-API-Key auth): room id `f1e0b711-f46e-4ad5-94e4-7ce50db2f08f`, title "Metis Dark Factory build room", status active, owner = the user account (visible in BAND Desktop). API finding: `/api/v1/agent/*` endpoints require an agent key (user key → 403 "requires agent authentication"); user key works on `/api/v1/me/*`; agent provisioning path verified: POST /api/v1/me/agents/register {name, description} returns the agent + its API key (shown once). DONE 2026-09-29 ~04:35 UTC: factory build-floor room created via POST /api/v1/me/chats — room id `a9ebab1a-4ae0-4d2d-9bbf-a9de310adf5b`, title "Metis Dark Factory — build floor". The 5 optimal seats are seated as members (moved out of the lounge room): architect→metis-decision-science (53c0cfb1-b924-41fb-af61-4ba4370e2f40), builder→metis-product-builder (263343c4-8829-4c79-b51b-25a12ed2b113), race-hunter→metis-qa-red-team (2077a3e2-f098-4920-b428-dc95d4fd8978), regression-guard→metis-platform-reliability (fd08faca-3249-4f46-9190-087c398f7c84), spec-warden→metis-risk-compliance (fad90073-3ea4-4431-9b77-529f857b888b). Generic mandate files exist in seats/{architect,builder,race-hunter,regression-guard,spec-warden}.md. Liveness supervisor built at ~/workspace/band-live/factory_supervisor.py (5 seats, @mention handoffs, cascade inference, cooldowns) — BLOCKED on agent API keys: 18/20 keys lost (shown once at registration, no rotate endpoint, agents undeletable, account at 20/20 cap); only metis-outbound-agent + metis-economic-analyst keys verified. Human gate: user reveals/regenerates the 5 seat keys in BAND Desktop and pastes them transiently, then seats go live. Lounge room f1e0b711-f46e-4ad5-94e4-7ce50db2f08f now holds owner + 14 agents. |
| Demo video (script done; 4/7 shots captured) | PARTIAL — shots 1/4/5/7 done; 2/3 (room) blocked; shot 6 (stage-2 UI) UNBLOCKED by this run — UI is live at GET /; WIP preview cut `video/preview-wip.mp4` assembled with labeled placeholders |
| Public GitHub repo | DONE — https://github.com/metismuse/dark-factory (public) |
| Cover image | DONE — video/cover.png (1280×720, 5 stations, pushed) |
| Slides | DONE — video/slides.md draft + video/slides.pdf export (7 pages, verified) |
| Submission to lablab.ai | NOT DONE — user-confirmed action |

## What's now done that was queued (2026-09-29 ~00:50 CDT run — STAGE 2)
- Stage 2 built + verified: `app/ui.html` (zero-dependency single page, inline
  CSS/JS, no CDN) served verbatim at GET / and /index.html (200, text/html) —
  wallet list + create form, wallet detail (balance, deposit form, transfer
  form, statement list), error display. 17 data-testids, each present exactly
  once (provisional values from SPEC.json; rename to official spec at lock).
- `tests/stage2.test.js` 6/6 green: serves HTML, /index.html alias, testids
  present-exactly-once, no duplicates/mistypes, zero external network refs,
  API round trip (create wallet → deposit → balance 777).
- spec-warden: **27 CONFORMS / 0 DEVIATES / 0 SKIPPED** (ui.serves + ui.testids
  now live probes; the ui.testids BLOCKED item is retired).
- regression-guard: golden 14/14 + race 8/8 + stage4 5/5 + stage2 6/6 =
  **33 tests green**; baseline raised 27 → 33.
- Clean-boot re-verified under `unshare -rn`: health 200, UI 200, outbound
  probe 000 (blocked).
- Dispatch log: STAGE 2 DISPATCH entry recorded (task text + outcome +
  architect verdict).
- Note: the official track spec's exact data-testid values are still not in
  hand (parent Packet A browser task). The UI is structurally complete; a
  spec-lock is a rename-only change, no rework.

## What's now done that was queued (2026-09-29 ~03:30 CDT run)
- Stage 3 built + verified: `tests/race.test.js` (8/8 green) — overdraft storm (exactly 5/100 succeed, rest 422),
  same-key replay race (50 concurrent → one transfer, money once), key-fight race (one 201, 29×409),
  deposit same-key race, 400-transfer distinct-key burst (conservation, no negatives), adversarial amounts
  (floats/strings/zero/neg/null → 400 invalid_amount), adversarial bodies (array/nested → 400), cross-endpoint
  key reuse documented as 409.
- Stage 4 built + verified: `GET /api/v1/wallets/:id/transfers` (wallet statement) + `GET /api/v1/deposits/:id`
  in store.js/server.js (VERSION 0.1.0-stage4); `tests/stage4.test.js` 5/5 green; stage-1 contract intact.
- spec-warden: conformance-check.js + SPEC.json extended (27 items) → **25 CONFORMS / 0 DEVIATES / 1 SKIPPED**
  (ui.testids, still blocked). Baseline raised: golden 14 + race 8 + stage4 5 = **27 tests green**.
- Clean-boot re-verified post-changes: health 200 under `unshare -rn` (zero outbound).
- Slides exported: `video/slides.pdf` (7 pages, pdfinfo-verified).
- Video WIP preview cut `video/preview-wip.mp4`: shots 1/4/5/7 + labeled placeholder cards for blocked shots
  2/3 (room, DQ item) and 6 (UI) — verifies the assembly pipeline end to end; final cut is a swap-in.
- Dispatch log: STAGE 3 + STAGE 4 dispatches recorded with exact task texts and adversarial verdicts.

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

1. **Official track spec** (lablab.ai session): VERIFIED LIVE 2026-09-28 ~22:59 CDT —
   enrollment ACTIVE/"Approved" (3,239 participants). Tracks: **tablekeeper** (OpenTable clone; invariant: a table must never be double-booked under concurrency/retries/timezones) and **pocketful** (Venmo clone; invariant: money must never be created, destroyed, or spent twice under concurrency/retries/rounding). Prizes per track $1,500/$1,000/$500 (2nd needs ≥4 entries, 3rd needs ≥6; unawarded not redistributed). Judging 50% Factory / 25% App / 25% Agent Teamwork. **Critical rules:** mandates must be GENERIC (naming track detail = disqualification); ≥3 distinct seats each with a mandate file; repo = public GitHub, one folder per completed stage (min stage-1), + mandates + FACTORY.md + room export; video MUST include the BAND room recording; service must build/serve from a clean container with NO outbound network. Deadline Oct 6 1:59 AM CDT. OPEN GAP: per-stage (1–4) service descriptions + CPU/mem caps/concurrency/timeouts "published with the spec at kickoff" are not on the page — pull from the BAND hacker guide or kickoff material.
2. **BAND account + API key** (free, app.band.ai): blocks the real room, the
   room export (minimum eligibility), the room recording (video DQ item), and
   all Agent Teamwork evidence (25% of the score). This is the single biggest
   remaining risk. AUTH SCHEME VERIFIED 2026-09-28 ~23:05 CDT from official
   band-sdk-python (GitHub README/AGENTS.md): REST default https://app.band.ai,
   WS wss://app.band.ai/api/v1/socket/websocket, API key sent in `X-API-Key`
   header on REST (query param `api_key` on WS upgrade). SDK: pip `band-sdk`;
   `Agent.create(adapter=..., agent_id=..., api_key=...)`; user-level REST key
   provisions its own agents.
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
