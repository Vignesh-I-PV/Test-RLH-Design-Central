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

## UPDATE 2026-07-23 — Supabase landed since this file was last written; RLH Plan Ingestion built

**This file was stale going into this session** — it still describes the pre-Supabase
skeleton. Supabase auth (magic-link, `profiles.role`), the full Ops Alignment lifecycle
(push/submit/acknowledge/finalise/unfreeze via real Postgres functions), SC Master's
`sc_reviewers` default-reviewer picker, and the plan-snapshot file-naming/versioning writes
all landed between that version and this session — see the handover this session started
from for the full detail; treat that as authoritative for the Supabase layer, this section
as the delta on top of it.

### RLH Plan Ingestion (Mode 2) — real file-upload → validate → create-a-plan, built this session

This is the two-stage-simulation split agreed this session: **Mode 1** (ingest data to
simulate the Design Input sheets through to plan creation — Volume/Node master uploads,
no solver) is a separate, not-yet-built track. **Mode 2** (ingest an already-created plan
straight into Design Review / Ops Alignment, as a live example of the feedback flow) is
what this section covers, and is real, working code as of this session — not a stub.

**Template** — one row per DC (touch point), not per route, matching the real source data:
`Zone, LMSC, LMDC, DC latitude, DC longitude, Volume, Route Code, Touch Point, Vehicle Type,
Breakdown Distance, Round Trip Distance, Run ID`. Breakdown Distance is **cumulative from the
SC**, not leg-to-leg, despite the column name — `Round Trip Distance − last Breakdown Distance`
gives the return leg. Run ID is unique per LMSC and becomes `plan.fileBaseName` directly (no
renaming needed — the real format `SC_YYYYMMDD_HHMMSS` already matches the existing snapshot
naming convention). One file can contain multiple SCs — grouped and validated independently,
each producing its own plan.

**New functions** (all in `test-rlh-design-central-base.jsx`):
- `NDC_realHaversineKm` — genuine straight-line distance (R=6371, no fudge factor) × 1.25
  road-distance buffer. Deliberately separate from the pre-existing `NDC_haversineKm`, whose
  ×55 multiplier is calibrated only for this app's fabricated, sub-degree, city-scale seed
  coordinates — applying it to real ingested coordinates would be badly wrong (a real 50km gap
  would come back as ~2,750km). Real ingested coordinates always use the new function; the
  legacy Network-Map/demo flow is completely untouched and still uses the old one.
- `NDC_parseCsv` — minimal CSV parser (quoted fields, embedded commas, CRLF/CR/LF). Nothing in
  the app read actual file content before this — every upload path (Volume, Nodes) only ever
  read `file.name`/`file.size` to seed a random pass/fail, never the file body.
- `parseRlhIngestCsv`, `validateRlhIngestRows`, `buildIngestedRlhPlans` — replace the old
  `ingestRlhPlan()` cosmetic stub entirely. Validates: LMSC/Vehicle Type must exist in their
  respective Masters (both maintained manually — not auto-created from the file, by explicit
  decision); Zone cross-checked against SC Master's zone as a warning, not a hard error; LMDC
  unique per route; one Vehicle Type and one Round Trip Distance per route; Touch Point
  sequential 1..n; Breakdown Distance must never *decrease* along a route (a **tie is legitimate**
  — two DCs can be co-located with a genuine zero-distance leg between them, confirmed against
  real sample data — only an actual decrease is bad data). All-or-nothing per file, matching the
  existing Volume-tab convention: any row error rejects the whole file, nothing partially lands.
- `ingestRlhPlanFile` — file picker → read → parse → validate → build → store, wired to the
  real "Ingest CSV" button (previously pointed at the stub). New state: `ingestedRlhPlans`
  (real per-SC "validated, ready to push" plans, keyed by LMSC code) and `ingestErrModal` (new
  error-list modal, modeled on the existing `volErrModal`).

**Engine integration** (`genDcRows`, `computeHypotheticalPlan`, `doPush` — all additive, legacy
synthetic-plan behaviour is unchanged):
- `genDcRows` returns real per-DC data as-is (real lat/lng/volume/leg-distance) when a row
  carries ingested DC objects, tagging each `isReal: true`; falls through to the existing
  jitter/synthesis path for legacy string-array rows exactly as before.
- `computeHypotheticalPlan` now treats a real ingested leg distance as the route's official
  distance by default (not just as an Ops-feedback override) via a new `userDistanceIsIngested`
  flag. The existing `>25%` variance warning now **only fires for a genuine feedback override**,
  never for ingestion ground truth — confirmed against the real sample that ~22% of legitimate
  real legs exceed 25% variance vs. the buffered-haversine estimate even after the 1.25× buffer
  (real roads wind around terrain; that's expected, not bad data, so checking it would just be
  noise). The return leg uses the real ground-truth value when a route is unmodified from
  ingestion, falling back to haversine (the correct real/legacy variant, chosen per-DC) otherwise.
- `doPush` — a validated ingested plan for an SC always takes priority over a Network Map run
  (no run needed at all). Computes real per-route `volume`/`cps`/`util` via
  `computeHypotheticalPlan`, attaches the workflow fields (`ops`/`planner`/`fb`) every row needs
  to match the existing shape. `metrics.coverage` is `1` for an ingested plan (every DC in the
  file is genuinely served — nothing is "skipped" the way an optimizer run might); `metrics.util`
  is a real average of real per-route utilisation, matching the exact averaging convention
  already used elsewhere in the app (`avgUtil`).
- Verified end-to-end against a real 571-row / 156-route / 4-SC sample: computed total distance
  matched the file's real Round Trip Distance sums almost exactly (rounding only), zero spurious
  variance warnings, brand-new push / re-push-of-same-SC / Finalise Directly all produce correct
  `status`/`fileBaseName`/`allDecided`.

**No Breakdown TAT / Out Cutoff data exists anywhere for an ingested plan** — the real template
has no such columns, and per product decision this isn't needed (also dropped from the Ops
Feedback override model already). `row.breakdownTat`/`row.outCutoff`/`plan.metrics.avgTat` are
`null` for a freshly-ingested plan; every display spot that formats these (`+'h'` string concat,
`addHours`/`addHoursA` cutoff math) is now null-guarded to show `'—'` instead of crashing or
showing `"nullh"`. Once an ingested plan goes through Ops Feedback + Finalise, the existing
finalise-commit fallback (originally only for genuinely brand-new routes) now also covers this
case, so post-finalise rows pick up the same generic default every other route gets
(`distance / 42` hours estimate, `23:00` cutoff) rather than carrying `null` forward indefinitely.

**Known gap, not yet fixed — flag before Ops Feedback is exercised on an ingested plan**: the
finalise-commit step (the code that actually writes `computeHypotheticalPlan`'s hypothetical
structure back into `plan.rows` — search for `dcCodes: dcs.map(x => x.code)`) flattens each
route's DCs down to bare code strings, discarding real lat/lng/volume/distance. On the *next*
read of that row, `genDcRows` sees plain strings (not the real per-DC objects) and falls back
to synthetic jittered geometry — so a single Ops Feedback + Finalise cycle on an ingested plan
will silently replace its real DC-level data with fabricated data. Not touched this session
(pre-existing code, out of the agreed #1–7 scope) — needs its own fix (preserve real per-DC
objects through the commit step, mirroring what `genDcRows`/`computeHypotheticalPlan` do) before
Mode 2's "live example of the feedback flow" goal is fully real end-to-end.

**Mode 1 (Design Input ingestion) — not built this session.** `validateVolCsv()` (Volume tab,
LMSC/LMDC Landing types) and `uploadNodeChanges()` (Nodes tab) are both still cosmetic stubs
exactly as this file previously described — real parsing/validation for these was explicitly
decoupled from Mode 2 this session (per-DC volume for Plan Ingestion comes from the plan file
itself, not from Volume Inputs) and remains a separate, later piece of work. There is also still
no run-generation/optimiser step anywhere in this codebase (`triggerRuns()` is a cosmetic
progress-bar simulator; `d.runs` is always empty in this fork) — by explicit decision this
session, no solver is being built; Mode 1's scope is bounded at "the Design Input masters are
genuinely ingestible," not at producing a plan.
