# Dark Factory — Build Plan (Sep 26 → Oct 5, 2026)

Hard constraints: **$0 spend** (no paid APIs, no entry fees, no Claude Code paid sign-in — inference via NVIDIA NIM
free tier → OpenRouter free models; see `~/workspace/skills/nvidia-nim/`, `~/workspace/skills/openrouter/`).
**No mid-stage steering** (autonomy = 25% of score: the dispatched task per stage is the only human input — parent
must treat each stage dispatch as fire-and-forget). Mandates stay **track-generic** (track-specific mandate = DQ).
**Clean-container, no-outbound-network** service boot is a hard gate (doesn't start = zero).

Track pick: `tablekeeper` vs `pocketful` — decided Day 2 on spec quality + free-model tractability.
Competitor intel: yanerox69/dark-factory (pocketful) runs 5 seats, 4 of 5 forbidden from writing production code
(architect, spec-warden, builder, race-hunter, regression-guard) — conformance-over-speed is the winning shape.

## Day 0 — Sat Sep 26 (today, remaining)
Parent browser tasks (existing sessions, no new accounts by me):
1. Enroll `metismuse` in the hackathon on lablab.ai; retrieve track specs (tablekeeper + pocketful), BAND Hacker
   Guide link, deadline time/timezone, solo-team eligibility.
2. Create free BAND account at app.band.ai (no card) → produce API key for headless sign-in.
3. Join BAND Discord (announcements/builder support).
Reversible prep (me): scaffold repo dir, pip probe of `band-sdk`/`band-mcp` in a venv, note versions.
GATE G0: specs in hand + BAND account exists. Without specs, no track pick.

## Day 1 — Sun Sep 27 — Band Desktop headless feasibility
1. Download Band Desktop Linux build; run under `Xvfb` (present) via `xvfb-run`.
2. Sign in with API key (headless path per docs.band.ai/jam); complete onboarding: CLI install/repair, readiness
   checks, `band` CLI + `jamd` verified, daemon state in `~/.jam`.
3. Create first BAND room from CLI; verify room appears in Desktop board under virtual display.
4. Screenshot/ffmpeg smoke test of the room view (needed later for the DQ-critical room recording).
**GATE G1:** Desktop runs headless AND room is creatable/recordable. If NO → pivot: CLI/API-only room operation,
   reassess the room-video requirement risk; possible human-gate (user records room on their Mac) as fallback.

## Day 2 — Mon Sep 28 — Free-model agent loop + track pick
1. Connect a coding agent without paid sign-in: `opencode` (or SDK ACP adapter) driven by NVIDIA NIM free /
   OpenRouter free model, joined to the room via `band-mcp` / SDK.
2. Toy cycle: architect plans → builder implements → spec-warden gates → regression-guard baselines. Prove a
   stage-1 slice end-to-end.
3. Pick track on evidence: spec clarity, harness tractability with weak free models, UI weight (App = 25%).
**GATE G2 (end of 48h):** free-model loop completes a stage-1 slice in the room. If NO → cut scope (fewer seats,
   simpler track) or no-go with sunk cost ≈ 2 days.

## Day 3 — Tue Sep 29 — Factory standup
1. Write seat mandates (generic, reusable — DQ-safe), `FACTORY.md` skeleton (seat setup, rationale, cost log,
   bad-work recovery procedure).
2. Spawn seats (architect / spec-warden / builder / race-hunter / regression-guard); dispatch **stage 1 only**,
   then hands off — no steering.

## Day 4 — Wed Sep 30 — Stage 2
Dispatch stage 2; self-check harness runs per track spec; golden test suite baseline recorded by regression-guard.

## Day 5 — Thu Oct 1 — Stages 3–4
Push remaining stages. Service boots in a network-isolated sandbox (`unshare -n` / bubblewrap — no Docker on VM,
verify availability Day 1). **GATE G3:** service starts clean with zero outbound network. Fail → fix-or-cut.

## Day 6 — Fri Oct 2 — Conformance hardening
spec-warden sweep: exact field names, status codes, `data-testid` values vs track spec; race/idempotency/malformed
input probes; measured inference costs logged into `FACTORY.md`.

## Day 7 — Sat Oct 3 — Evidence capture
Export BAND Desktop room; record room under Xvfb with ffmpeg (DQ item #1); walkthrough video; autonomy audit
(only dispatched tasks were human input — collect the dispatch log).

## Day 8 — Sun Oct 4 — Submission artifacts
Cover image, slide deck, public GitHub repo, final `FACTORY.md`, long description. **GATE G4:** DQ checklist
green (room video present, mandates generic, service boots clean, stage 1 complete, repo public).

## Day 9 — Mon Oct 5 — Submit
Submit via lablab.ai form (parent browser task if session needed); keep buffer for harness re-runs. Deadline
Deadline confirmed: Oct 6, 2026 1:59 AM CDT (BUILD_STATUS.md 2026-09-27 ~08:15 CDT).

## Risk register
- Band Desktop GUI unusable headless → G1 fallback (human records room; or CLI-only with video risk accepted).
- Claude Code sign-in is the documented agent path; paid/identity-bound → we use non-Claude agents via SDK/ACP.
  If the room export or plugin flow turns out Claude-Code-only, escalate.
- Free-model quality on exact-conformance tasks: mitigate with spec-warden + golden suite, not bigger models.
- lablab.ai enrollment DONE 2026-09-27 ~00:47 CDT: solo entry, SUBMITTED + APPROVED, no phone verify encountered.
