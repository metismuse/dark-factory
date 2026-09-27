# FACTORY.md — the software factory

Entry for **WeAreDevelopers × BAND — Dark Factory**, track: `pocketful` (provisional;
confirm against the official track spec). What the factory builds: a wallet and
payments service ("pocketful"), graded by an automated harness on literal
conformance — exact field names, exact status codes, exact `data-testid` values —
plus the four stages (JSON API → Web UI → concurrency control → domain extension).

## The shape

An assembly line with two customs posts. Rejections travel backwards to the
implementer with expected-vs-actual. Design disagreements go up to the architect.
Only product decisions reach the human.

| Seat | Role | Writes code |
|---|---|---|
| `architect` | Plans, splits work, runs the full gate, renders verdicts | No |
| `spec-warden` | Literal conformance with the written specification | No |
| `builder` | The JSON API and the web UI | **Yes** |
| `race-hunter` | Concurrency, idempotency, malformed input | No |
| `regression-guard` | Golden suite and baseline test count | No |

One implementer, three verifiers, one planner. The grading is literal and
automated, so the advantage is refusing to hand off anything that does not
conform — not implementing faster. Seat mandates live in `seats/`; they are
deliberately track-generic (a mandate naming track-specific detail is a
disqualifier — that detail lives only in dispatched tasks and `SPEC.json`).

## Routing

Adding an agent to a room does not wake it. Every handoff is an explicit
`@mention`. Handoff targets are never hardcoded: each seat inspects the room
participants at handoff time and mentions whoever holds the next role. The line
can be re-crewed at runtime.

## Seat setup

**Current (no BAND account yet):** seats run as dispatched tasks against this
repo. `factory/dispatch-log.md` is the room-transcript surrogate — it records
every stage dispatch (the human's only input per stage) and every verdict, in the
same shape BAND room messages will take.

**Once the BAND API key exists** (parent browser task: free BAND account at
app.band.ai): each seat becomes a BAND agent via `band-sdk`:

```python
from band import Agent
from band.adapters.opencode import OpencodeAdapter, OpencodeAdapterConfig

adapter = OpencodeAdapter(config=OpencodeAdapterConfig(
    provider_id="openai",          # opencode serve provider id for the free tier
    model_id="nvidia-nim/gpt-oss-20b",
))
agent = Agent.create(adapter=adapter, agent_id="<seat-uuid>", api_key="<BAND_API_KEY>")
```

`opencode serve` runs locally with the free inference cascade (NVIDIA NIM free
→ OpenRouter free; see `~/workspace/skills/nvidia-nim/`, `~/workspace/skills/openrouter/`).
No paid sign-in anywhere on the line. `band-sdk` 3.2.1 is installed and probed.

**Room export** (minimum eligibility requires the BAND Desktop room export):
rooms are server-side BAND state; export via the Desktop app or the platform API
once the account exists. Until then, `factory/dispatch-log.md` + `SPEC.json` +
the golden suite are the auditable trail.

## Design rationale

- **Conformance over speed.** The harness scores exactness, so four of five seats
  are forbidden from writing production code. The builder is the only seat that
  touches the service.
- **Checklist-first.** The spec-warden extracts the conformance checklist from the
  written spec BEFORE reviewing any implementation (`SPEC.json`; executable as
  `factory/conformance-check.js`).
- **Zero-dependency service.** `app/` is Node.js standard library only — no
  package.json, no node_modules. The service must build and serve from a clean
  container with no outbound network; every dependency is a boot risk. Verified:
  boots and serves under `unshare -rn` (network namespace isolated, only loopback
  up).
- **Money rules** (pocketful): integer minor units only; one atomic critical
  section per write path (`store.js`, `Mutex.run` in `applyTransfer`); durable
  commit of the transaction record before the balance mutation; idempotency keys
  return the original stored response and move money exactly once.

## Measured costs (2026-09-27)

| Item | Cost |
|---|---|
| Inference (all seats, all runs) | $0.00 — local compute + free tiers only |
| Golden suite (`node --test tests/golden.test.js`) | 14 tests, ~9 s wall |
| Conformance probe (`factory/conformance-check.js`) | 22 checks, ~3 s wall |
| Clean-boot verification (`unshare -rn`) | ~3 s wall |
| Runtime dependencies of the service | 0 |

## How the factory catches and recovers from bad work

1. **Customs posts in series.** Builder hands off by commit reference →
   spec-warden (literal conformance) → race-hunter (adversary sweep) →
   regression-guard (full gate vs baseline). Any post can bounce work backwards
   with expected-vs-actual. One deviation rejects the whole handoff.
2. **The baseline never lowers.** regression-guard records the passing count at
   the first APPROVED stage (14). A later stage with fewer passing tests is RED,
   no exceptions.
3. **Honest retractions.** A seat may raise a finding, disprove it, and retract
   it in the open — the retraction with its disproof is evidence, logged in the
   dispatch log.
4. **Adversarial sign-off.** The architect signs off the atomicity chokepoint by
   file and line (`store.js`, `Mutex.run` in `applyTransfer`), never by summary.
5. **Stage 1 incident, 2026-09-27:** the golden suite caught a real design
   question — idempotent replay returning 201 (original stored response, Stripe
   convention) vs 200. Resolved per the exactly-once invariant ("returns the
   original stored response"), test corrected, suite green. This is the factory
   working as designed: the gate caught it before any human saw it.
