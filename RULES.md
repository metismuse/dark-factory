# Dark Factory — Rules, Rubric, Requirements

Event: **WeAreDevelopers x BAND present: Dark Factory AI Hackathon**
Page: https://lablab.ai/ai-hackathons/wearedevelopers-hackathon
Sources: lablab.ai event page (search-engine crawl ~17:20 CDT 2026-09-26); docs.band.ai/jam (fetched 2026-09-26 ~19:25 CDT);
parent brief (prize/track figures); github.com/yanerox69/dark-factory (competitor entry README, crawled 2026-09-22).

## Basics
- **Format:** virtual, global, online. Build window **Sept 26 – Oct 5, 2026** (~9 days).
- **Prize pool:** $6,000+ across **two tracks** (brief-sourced: tablekeeper pays 1st $1,500 / 2nd $1,000 / 3rd $500).
  Track list as observed: `tablekeeper`, `pocketful` (pocketful confirmed by a live competitor entry building a
  wallet-and-payments service; full track/prize table to verify at enrollment — spec published at kickoff).
- **What you build:** a software factory in BAND Desktop — a band of coding agents that plans work, implements it,
  and checks its own results. "For one week, you build a software factory in BAND Desktop: a band of coding agents
  that plans work, implements it and checks its own results."
- **Getting started (per event page):** create a free BAND account (no card needed), download BAND Desktop, join the
  BAND Discord for onboarding resources, announcements, builder support.
- Bonus promo (stale): free ticket to WeAreDevelopers World Congress North America, San Jose, Sep 23–25 — dates are
  already past; ignore.

## Partner / tech surface (event page "Who is behind it")
- BAND Hacker Guide (platform overview, building flow) — retrieve at enrollment.
- BAND Desktop — app your band works in; sign in, install CLI + coding-agent plugin, run readiness checks, live board
  of agents/rooms/work items/decisions. Event copy claims "macOS, Windows and Linux"; **docs.band.ai/jam says
  macOS or Linux, Windows not supported yet** — docs win; discrepancy noted.
- docs.band.ai/jam: canonical setup (formerly "Jam"; use `band` CLI, daemon still `jamd`, state in `~/.jam`).
- BAND SDK Setup — adapters for Claude Code, Codex, LangGraph, CrewAI, Pydantic AI, Agno, "and more"
  (SDK repo band-ai/band-sdk-python additionally shows: anthropic, claude_sdk, gemini, google_adk, opencode,
  copilot_acp/copilot_sdk, crewai_flow, letta (Linux-only lane), parlant).
- BAND Agent API — autonomous agents, peer recruitment, agent-to-agent workflows.

## Judging rubric (event page, authoritative — supersedes the brief's "60/100" shorthand)
- **50% — Factory.** Generic, effective, reusable: mandates another team could point at a different problem; how far
  through the **four stages** it got with code that meets the spec; a `FACTORY.md` sufficient to stand it up —
  seat setup, design rationale, measured costs, how it catches and recovers from bad work.
- **25% — App.** What the factory built: coherent, presentation-ready, responsive UI over maintainable code.
- **25% — Agent Teamwork.** Collaboration: the seats really shared the work — review changed something, handoffs
  carried the whole task, code traces to the room. **Autonomy:** in the submitted run, the task dispatched for each
  stage is the **only** human input — no steering, approvals, or reruns.
- Automated harness: exact field names, exact status codes, exact `data-testid` values per track spec
  (competitor entry: "A beautiful screen with a mistyped attribute scores zero"). Harness detail lives in the
  per-track spec published at kickoff — **not yet in hand; retrieve at enrollment.**

## Minimum eligibility
- A **complete stage 1**, plus: your seat mandates, your factory description, and the **export of the BAND Desktop
  room** your band worked in.

## Submission (form on lablab.ai)
- Basic info: project title, short description, long description, technology & category tags.
- Cover image; video presentation; slide presentation.
- **Public GitHub repository.**

## Hard constraints / disqualifiers
1. **Video must include a recording of the BAND Desktop room that generated your solution, plus a walkthrough.
   A video without the room recording DISQUALIFIES the team.**
2. Service must **build and serve from a clean container with no outbound network**. Test before submitting —
   a service that doesn't start scores zero. CPU/memory caps, harness concurrency, per-request timeouts published
   with the spec at kickoff.
3. A mandate that names **track-specific detail** is a disqualifier — mandates must stay generic.

## Open items (enrollment done 2026-09-27 ~00:47 CDT — SUBMITTED + APPROVED, solo entry, 3,071 participants)
- [x] Full track list + prize breakdown per track — VERIFIED at enrollment 2026-09-27: $6,000 cash across two tracks.
- [ ] Stage 1–4 definitions per track; harness/grading exactness rules; CPU/mem caps; concurrency/timeouts.
- [x] Submission deadline — CONFIRMED 2026-09-27 ~08:15 CDT (BUILD_STATUS.md): Oct 6, 2026 1:59 AM CDT (build window Sep 26–Oct 5).
- [x] Solo team eligibility — CONFIRMED: solo entry SUBMITTED + APPROVED 2026-09-27 ~00:47 CDT, no phone verify encountered.
- [ ] Whether the BAND Desktop room export is obtainable via CLI/API headlessly (needed for the room-video + export
      submission items if the GUI proves unusable).
