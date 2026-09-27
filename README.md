# Dark Factory — production scaffold

WeAreDevelopers x BAND hackathon. Build window **Sep 26 – Oct 5, 2026**. Prize pool **$6,000+** (two tracks).

## Status (2026-09-26 ~19:30 CDT)

**lablab.ai registration: DONE — no action taken.** Per pre-flight check (AGENTS.md rule), memory + state DB were
checked first: a `metismuse` lablab.ai account was already created and email-verified earlier today (~17:20 CDT,
passwordless email-code flow). Creating a second account would violate the no-duplicate rule, so the registration
attempt was correctly skipped. **Still needed (parent browser task, existing session): enroll in the hackathon.**

**BAND Desktop: INSTALLABLE on this VM (pending proof).** Authoritative docs (docs.band.ai/jam, fetched 2026-09-26)
list prerequisites as **macOS or Linux** — Windows not supported yet — so the Linux VM is a supported platform
(the event page's "macOS, Windows and Linux" copy is stale on the Windows claim). Headless plan: Xvfb + xvfb-run
(both present) for the virtual display, ffmpeg (present) for the DQ-critical room recording, API-key sign-in
(the documented headless sign-in path). Daemon state lives in `~/.jam`. VM notes: no DISPLAY, Python 3.12, node
present; **no Docker** — clean-container service test will use `unshare`/bubblewrap instead. The BAND account
itself (free, no card) is a parent browser step — out of scope for this task by the brief's account limits.

## Files
- `RULES.md` — rules, rubric (50% Factory / 25% App / 25% Agent Teamwork), submission requirements, disqualifiers,
  sources + crawl times, open items to verify at enrollment.
- `BUILD_PLAN.md` — day-by-day plan Sep 26 → Oct 5 with go/no-go gates G0–G4 and a risk register.

## Parent action queue (browser-capable)
1. lablab.ai: enroll `metismuse` in Dark Factory; pull track specs (tablekeeper, pocketful), hacker guide,
   deadline time/timezone, solo-team eligibility.
2. app.band.ai: create free BAND account → API key for headless Band Desktop sign-in.
3. Join BAND Discord.

## First 48h (see BUILD_PLAN.md Day 1–2)
G1: Band Desktop runs under Xvfb, signs in via API key, room creatable + recordable. G2: free-model agent loop
(NVIDIA NIM / OpenRouter free) completes a stage-1 slice; track picked on evidence.

## Stage-1 build status (2026-09-27 ~08:15 CDT)

Stage 1 (JSON API) is built and gated: `app/server.js` + `app/store.js` (Node.js
stdlib only, zero dependencies); `tests/golden.test.js` 14/14 green (incl.
500-transfer conservation storm + concurrent idempotency race);
`factory/conformance-check.js` 22 CONFORMS / 0 DEVIATES / 2 SKIPPED;
clean-boot verified under `unshare -rn` (zero outbound network). Names in
`SPEC.json` remain provisional until the official track spec is in hand.
~30% of the full entry. Full accounting: `BUILD_STATUS.md`.
Enrollment was SUBMITTED + APPROVED 2026-09-27 ~00:47 CDT (solo entry).
