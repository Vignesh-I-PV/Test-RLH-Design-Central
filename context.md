# Handover — Network Design Central (NDC) v2.0 / RLH Design Central
## SKELETON BUILD — for Ops-Lead UAT with real ingested data

## What this is
This is a forked/duplicated copy of the main NDC v2.0 prototype, created 2026-07-14
specifically to run Ops-Lead UAT with real plans instead of fabricated demo data. The main
repo continues on as the actively-iterated line (Figma freeze + ongoing changes); this repo
is the "real data" testing ground, and Supabase integration (real auth, real persistence) is
the next planned step here, not yet done as of this handover.

**Every screen, engine calculation, and interaction is identical to the main repo.** The
only change is what `buildSeed()` returns at startup:

| | Main repo | This skeleton |
|---|---|---|
| Sort Centres | 80 fabricated | **0 — empty** |
| Plans | ~45 fabricated, various statuses | **0 — empty** |
| Vehicle Master | 8 types (canonical) | **same 8 types, kept as real system config** |
| AutoDML / ingestion / volume-file history | fabricated | **0 — empty** |
| SC Vehicle Availability | fabricated | **0 — empty** |

Vehicle Master was deliberately kept, not stripped — it's canonical system config (cost/cap/
touch-point/feasibility rules) the cost-and-distance engine (`computeHypotheticalPlan`)
needs to compute anything at all, not a fictitious scenario. **Replace the 8 entries in
`buildSeed()` with your organisation's real fleet before running UAT if they differ.**

## What changed to make "zero data" actually safe
Emptying `buildSeed()`'s arrays surfaced a few spots that assumed at least one SC/plan
always existed (crash on `array[0].property` when the array is empty). Fixed:
- Constructor: `this.state.reviewSC` / `this.state.mapSC` initial selection — now null-safe
  when `data.scs` is empty (falls back to `null` instead of crashing on `scs[0].code`).
- `opsSubmitted` initial state had 3 hardcoded demo plan IDs seeded with fake submission
  records — cleared to `{}` since those plan IDs don't exist here.
- **Map Visualization tab** (`mapVals()`) was the one view genuinely built assuming a
  current SC always exists (arcs/DC markers/legend all derive from it) — rather than
  threading null-guards through ~120 lines of geometry math, it now short-circuits to a
  safe empty stub with an inline banner ("No Sort Centres ingested yet…") when
  `data.scs.length === 0`. Once at least one real SC exists, this guard stops firing and
  the view behaves exactly as it always has. **This is the one screen worth a dedicated
  click-through once you've ingested your first SC**, since it wasn't independently
  click-tested against real data before this handover — only reasoned through.
- Design Review, Design Creation, and Ops Alignment were **not** found to have equivalent
  hard crash points on empty data during this pass (they already used defensive
  `? :` / `|| []` / `|| {}` patterns for "nothing found" cases) — but, per this project's
  usual caution, that was verified by tracing the code, not by clicking through the live
  UI with zero data. Budget a real click-through of all four areas before trusting this in
  front of actual Ops Leads.

## How to get real data in, right now (before Supabase lands)
Two paths exist already, both untouched by this skeleton pass:
1. **Design Inputs → Sort Centre Master → Add SC** — a real, working form
   (`submitAddSc()`) for adding one SC at a time by hand. Same for **Add Vehicle Type**
   under Vehicle Master if the fleet differs from the kept placeholder.
2. **The "Ingest RLH Plan" button** under Design Review's Ingestion tab
   (`ingestRlhPlan()`) — flagged here explicitly: **this is a cosmetic demo stub**, not a
   real file-parsing pipeline. It fakes a counter increment and a toast; it does not
   parse an uploaded file into a real plan. Per the original handover, Design Ingestion
   has "no build visibility — never touched, never verified" — that remains true here.
   **Do not rely on this button to get real plans in for UAT.** Until Supabase lands (or
   this gets built out for real), the practical way to seed a real plan is to hand-construct
   a plan object matching the existing shape (see `plans.push({...})` in the main repo's
   former `buildSeed()`, now removed here, for the exact field list) and insert it directly,
   or wait for the Supabase ingestion path.

## Architecture essentials (unchanged from main repo — repeated here for a standalone reader)
- **No build step.** Babel compiles the JSX in-browser at page load. Validate any edit with
  `node check.js test-rlh-design-central-base.jsx` (a small Babel-based syntax checker — not
  included in this handover bundle by default, recreate it or ask for it if needed) before
  considering a change done.
- **`with (B) { ... }` pattern.** Each major view has an `xVals()` method computing a big
  object of derived values/handlers, merged into JSX scope via `with`. A binding referenced
  in JSX must exist as a property on that object, in the same render pass.
- **`computeHypotheticalPlan(plan, effectiveFbByIdx)`** is the single source of truth for
  distance, cost, CPS, and validation errors/warnings. Never approximate separately.
- **`effectiveFbFor(plan)` vs raw `row.fb`** — always read proposed changes through
  `effectiveFbFor(plan)`, never raw `row.fb`/`r.fb` directly.
- **Nothing persists.** Like the main repo, this is still 100% browser-session state as of
  this handover — a refresh loses everything. That's the specific gap Supabase is meant to
  close next.

## Recent feature history inherited from the main repo (all present here)
- Change-flag taxonomy (Vehicle Change / DC Movement / Route Order Change / Distance
  Change / New Route·Split) — amber bar (5 flags), Route View (2 flags), Review Changes
  popup (bucketed).
- Acting Ops-Lead persona switcher ("Acting as" dropdown, top bar) — lets one browser
  session simulate multiple named reviewers submitting feedback on the same plan. **This
  will likely be replaced by real Supabase Auth logins in this repo once that lands** — the
  persona switcher was a simulation workaround for the single-session demo, not meant to
  coexist with real per-user login.
- Honest per-reviewer submission tracking (`plan.submittedReviewers`) — Acknowledge &
  Freeze no longer silently implies every assigned reviewer submitted; shows "Not-Submitted"
  per reviewer who hasn't.
- Distance-variance Accept/Revert flow, cross-browser favicon set, and everything else
  logged in the main repo's `context.md` — not re-detailed here to avoid drift between the
  two files; treat the main repo's `context.md` as the authoritative feature history up to
  the fork point, and this file as the delta (skeleton + whatever diverges from here on).

## Working-style notes for this project (unchanged)
- Discuss non-trivial changes before executing — lay out the plan, wait for a response.
- Prefer Add/Replace/Remove-style deltas over wholesale rewrites when touching existing
  documentation.
- This file should be treated as a living changelog from this fork point forward — append,
  don't rewrite, so future sessions (AI or human) can see what changed and why.
