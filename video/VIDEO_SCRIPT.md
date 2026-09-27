# Demo video — script + shot list

**DQ WARNING:** the video MUST include a recording of the BAND Desktop room that
generated the solution, plus a walkthrough. A video without the room recording
DISQUALIFIES the team. Shots marked [ROOM] are blocked until the BAND account +
Desktop exist; everything else can be captured now.

Target length: 3–4 minutes. Narration is written to be read verbatim.

---

## Shot 1 — Title (0:00–0:15) [CAPTURABLE NOW]

*Visual:* title card: "pocketful — a software factory in BAND Desktop".
*Narration:* "We built pocketful, a wallet and payments service, with a factory
of five coding agents sharing one BAND room. Grading is literal and automated —
exact field names, exact status codes — so our factory is built to refuse
anything that does not conform."

## Shot 2 — The band (0:15–0:50) [ROOM — BLOCKED]

*Visual:* screen recording of the BAND Desktop room: five connected agents,
swim lanes, the room plan.
*Narration:* "One architect plans and renders verdicts. Three customs posts —
spec-warden, race-hunter, regression-guard — verify everything. One builder
writes the code. Handoffs are explicit at-mentions; rejections travel backwards
with expected versus actual."

## Shot 3 — The gate catching bad work (0:50–1:20) [ROOM — BLOCKED]

*Visual:* room transcript excerpt: the idempotent-replay incident (raised,
resolved per the exactly-once invariant), a bounced handoff.
*Narration:* "The gate works. During stage one, the suite caught a real design
question about idempotent replays. The factory resolved it against the written
invariant before any human saw it."

## Shot 4 — Live API demo (1:20–2:20) [CAPTURABLE NOW]

*Visual:* terminal: boot the service (`node app/server.js`), then curl —
create two wallets, deposit, transfer, replay the same idempotency key, show the
conservation check.
*Narration:* "The service is Node.js standard library only — zero dependencies —
so it boots in a clean container with no network. Integer minor units, one
atomic critical section per transfer, idempotency keys that move money exactly
once."

## Shot 5 — The money invariants (2:20–2:50) [CAPTURABLE NOW]

*Visual:* `node --test tests/golden.test.js` running: 14 tests green, including
the 500-transfer conservation storm.
*Narration:* "Fourteen golden tests. Five hundred concurrent random transfers —
the total never moves. No balance below zero. Retries move money once."

## Shot 6 — The UI (2:50–3:20) [BLOCKED — stage 2]

*Visual:* the web UI with the exact data-testid elements, exercised end to end.
*Narration:* (to be written against the official spec's data-testid values)

## Shot 7 — Close (3:20–3:40) [CAPTURABLE NOW]

*Visual:* repo + FACTORY.md on screen.
*Narration:* "Every seat mandate is generic — hand them a different problem and
they still make sense. The factory is the entry."

---

## Capture checklist

- [ ] Shots 1, 4, 5, 7: terminal + screen capture (ffmpeg, local — no gate)
- [ ] Shots 2, 3: BAND Desktop room recording under Xvfb (BLOCKED: BAND account + Desktop)
- [ ] Shot 6: stage-2 UI walkthrough (BLOCKED: official track spec for data-testid values)
- [ ] Final assembly + voiceover (human-gated: recording)
- [ ] Upload to the lablab.ai submission form (human-confirmed action)
