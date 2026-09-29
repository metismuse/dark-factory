# Dispatch log — the human-input boundary

Autonomy rule (25% of score): in the submitted run, the task dispatched for each
stage is the ONLY human input — no steering, approvals, or reruns. Every dispatch
is recorded here with its timestamp. Anything not in this log was not human input.

Format per entry: `## <ISO timestamp> — STAGE <n> DISPATCH` + the exact task text.

---

## 2026-09-27T07:40:00-05:00 — STAGE 1 DISPATCH

> Build Stage 1 (JSON API) of the pocketful wallet service against SPEC.json
> (provisional). Done state: spec-warden CONFORMS on every stage-1 checklist item,
> race-hunter clean sweep, regression-guard full gate green at or above the 14-test
> baseline, architect APPROVED with adversarial sweep. Constraints: Node.js standard
> library only; integer minor units; one atomic critical section per write path;
> idempotency keys returning the original stored response; documented error envelope
> {error:{code,message}}; service must boot with zero outbound network.

Outcome (recorded 2026-09-27 ~08:10 CDT): builder delivered app/server.js +
app/store.js; spec-warden conformance-check.js 22 CONFORMS / 0 DEVIATES / 2
SKIPPED (ui.testids, ext.stage4 — blocked on official spec); race-hunter golden
suite 14/14 incl. 500-transfer conservation storm + concurrent idempotency race;
regression-guard baseline recorded at 14 tests; clean-boot verified under
`unshare -rn` (no outbound network). Architect verdict: APPROVED for stage 1
(provisional — exact field names to be re-locked against the official track spec).

---

## (Stage 2–4 dispatches go here as the build advances.)

## 2026-09-29T03:10:00-05:00 — STAGE 3 DISPATCH

> Build Stage 3 (concurrency control / race-hunter adversary sweep) of the
> pocketful wallet service against SPEC.json (provisional). Done state: a new
> `tests/race.test.js` adversarial suite green — overdraft storm (exactly N
> succeed, rest 422, conservation holds), same-key replay race (money moves
> once), same-key/different-payload race (exactly one 201, rest 409),
> deposit same-key race, distinct-key burst (conservation + no negatives),
> adversarial amounts (floats/strings/zero/negatives/null → 400), adversarial
> bodies (array/nested → 400; unicode owner accepted), cross-endpoint key
> reuse documented as 409. regression-guard: golden suite must remain 14/14;
> spec-warden: stage-3 money checks stay CONFORMS. No outbound network; $0.

Outcome (recorded 2026-09-29 ~03:20 CDT): builder delivered
tests/race.test.js (8 tests, 8 green, ~6 s wall — one self-caught test-helper
bug fixed before green: raw array body sent through fetch stringifies to
invalid JSON, corrected to JSON.stringify). spec-warden: money.integer_units /
money.atomic / money.conservation / money.nonnegativity / money.exactly_once
all CONFORMS (spot-checked live against the running service).
regression-guard: golden suite 14/14 green (no regressions). Architect
verdict: APPROVED for stage 3 (provisional — exact names re-lock against the
official track spec).

## 2026-09-29T03:21:00-05:00 — STAGE 4 DISPATCH

> Build Stage 4 (domain extension) of the pocketful wallet service against
> SPEC.json (provisional). Done state: an additive, breaking-nothing extension
> of the model and API — `GET /api/v1/wallets/:id/transfers` (wallet statement:
> every transfer where the wallet is sender or receiver, 404 wallet_not_found
> for unknown ids) and `GET /api/v1/deposits/:id` (404 deposit_not_found).
> SPEC.json gains api.deposit.get + api.wallet.transfers checklist items
> (provisional); conformance-check.js probes them live; new tests/stage4.test.js
> (5 tests) green AND golden suite stays 14/14 (extension breaks nothing).
> Clean-boot re-verified under unshare -rn. No outbound network; $0.

Outcome (recorded 2026-09-29 ~03:26 CDT): builder delivered store.js
(getDeposit, listWalletTransfers), server.js routes (VERSION 0.1.0-stage4),
tests/stage4.test.js (5/5 green), conformance-check.js + SPEC.json extended
(27 checklist items). spec-warden: 25 CONFORMS / 0 DEVIATES / 1 SKIPPED
(ui.testids — still blocked on the official track spec). regression-guard:
golden 14/14 + race 8/8 + stage4 5/5 = 27 tests green; baseline raised to 27.
Clean-boot verified: health 200 under `unshare -rn` (zero outbound).
Architect verdict: APPROVED for stage 4 (provisional — names re-lock against
the official track spec; if the official spec defines stage 4 as a different
extension, that gets built at lock time).
