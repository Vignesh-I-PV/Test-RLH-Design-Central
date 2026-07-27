# context.md — Network Design Central (NDC) v2.0 / RLH Design Central — UAT fork

This is the one place to read before changing anything in this fork — either yourself, or by
attaching this whole file (plus the repo link) to an AI assistant along with your question.

**This file was reconciled on 2026-07-24** — it had been appended to three times (skeleton
build → Supabase + Mode 2 → six parity fixes) without ever being corrected, which had left
real contradictions (e.g. one section calling a bug "not yet fixed" while a later section
described fixing it) and a top section that still described pre-Supabase behaviour as current
fact. The section below is the accurate current state; the dated changelog further down is
kept as history, with corrections noted inline where an earlier entry has since been resolved.

## What this is

A forked copy of the main NDC v2.0 prototype (`V2.0-RLH-Design-Central`), created to run
Ops-Lead UAT with **real data** instead of the main repo's ~80 fabricated demo Sort Centres.
The main repo continues on as the actively-iterated visual/interaction reference (Figma
remains the source of truth for design); this repo is the real-data testing ground, and has
since diverged from main in two ways: a real Supabase backend, and a real RLH Plan Ingestion
pipeline (neither exists in main).

## Current state — what's real vs. session-only, as of 2026-07-24

**Real, backed by Supabase** (not session-only, survives a refresh):
- Auth — real magic-link login. Identity and role (`planner` / `ops_lead`) come from the
  logged-in user's `profiles` row, set by hand in Table Editor. A planner can never be tagged
  as a reviewer (enforced at the database level).
- The full Ops Alignment lifecycle — Push → Submit feedback → Acknowledge → Finalise →
  Unfreeze all write through to real tables (`plans`, `plan_reviewers`, `plan_row_feedback`,
  `plan_reviewer_status`). Status can only change through three dedicated Postgres functions
  (`acknowledge_plan`, `finalise_plan`, `unfreeze_plan`) — a plain client update to `status`
  is rejected at the grant level.
- SC Master's default-reviewer list (`sc_reviewers` table) and the Push modal's real Ops Lead
  picker (no more free-text name/email entry).
- The 3-file plan-snapshot naming/versioning (`plan_snapshots` table) — see naming convention
  below.

**Real, but still session-only** (works, but a refresh loses it — not yet Supabase-backed):
- SC Master and Vehicle Master themselves (only SC Master's *reviewer list* is Supabase-backed,
  not the SC records; `submitAddSc()` / Add Vehicle Type are real, working forms).
- **RLH Plan Ingestion (Mode 2)** — real file-upload → validate → create-a-plan pipeline (see
  below). Produces a real plan object with real distances/costs, but that plan only becomes
  Supabase-backed once it's actually pushed via `doPush()`.
- Design Creation "runs" — this was never wired to anything real, in either repo (see gap #1
  below); Design Creation cannot currently produce a pushable plan on its own.

**Still cosmetic stubs** (do not rely on these for real data — true in main too, not a
UAT-specific regression):
- Volume tab uploads (`validateVolCsv()`, both LMSC and LMDC Landing types) — random pass/fail
  seeded from the filename, never reads actual file content.
- Nodes/AutoDML upload (`uploadNodeChanges()`) — hardcoded toast, never reads the file.
- Design Creation's "Trigger Runs" (`triggerRuns()`) — a cosmetic progress-bar simulator; never
  produces a real run. `d.runs` is always empty in this fork.

## RLH Plan Ingestion (Mode 2) — real, built 2026-07-23

The old "Ingest RLH Plan" button is a real pipeline now, **not** the cosmetic stub earlier
versions of this file described — do not trust any earlier line telling you otherwise.

**Template** — one row per DC (touch point), not per route: `Zone, LMSC, LMDC, DC latitude,
DC longitude, Volume, Route Code, Touch Point, Vehicle Type, Breakdown Distance, Round Trip
Distance, Run ID`. Breakdown Distance is **cumulative from the SC**, not leg-to-leg, despite
the column name — `Round Trip Distance − last Breakdown Distance` gives the return leg. Run ID
is unique per LMSC and becomes `plan.fileBaseName` directly (already matches the snapshot
naming convention below, no renaming needed). One file can contain multiple SCs, each
producing its own independent plan.

**Pipeline**: `parseRlhIngestCsv` → `validateRlhIngestRows` → `buildIngestedRlhPlans` →
`ingestRlhPlanFile` (file picker → read → parse → validate → build → store). All-or-nothing
per file (any row error rejects the whole file), matching the Volume-tab convention. LMSC and
Vehicle Type must already exist in their respective Masters (maintained manually, not
auto-created from the file — by explicit decision). Breakdown Distance must never *decrease*
along a route — a **tie is legitimate** (co-located DCs can share a cumulative distance;
confirmed against real sample data), only an actual decrease is bad data.

**Engine integration** — real ingested distance is the route's official distance by default
(`genDcRows`/`computeHypotheticalPlan`/`doPush` all updated, additively; legacy
Network-Map-driven synthetic plans are completely unaffected). A validated ingested plan for
an SC always takes priority over a Network Map run in `doPush()` — no run needed at all.
`metrics.coverage` is `1` for an ingested plan (every DC in the file is genuinely served).

**No Breakdown TAT / Out Cutoff data exists for an ingested plan** — the real template has no
such columns, and per explicit product decision this isn't needed (also dropped from the Ops
Feedback override model in both repos already). These fields are `null` for a freshly-ingested
plan; every display spot that formats them is null-guarded to show `'—'`.

Verified end-to-end against a real 571-row / 156-route / 4-SC sample: computed distances
matched the file's real Round Trip Distance sums almost exactly (rounding only), zero spurious
warnings, brand-new push / re-push / Finalise Directly / full Ops Feedback + Finalise cycle all
produce correct results with real data preserved throughout (see gap #2's resolution below).

## Two haversine functions — never interchange them

- `NDC_haversineKm` — has a **×55 fudge factor**, calibrated only for this app's fabricated,
  sub-degree, city-scale seed coordinates. Legacy/demo data only.
- `NDC_realHaversineKm` — genuine straight-line distance (R=6371, no fudge factor) × 1.25
  road-distance buffer. Real ingested coordinates only. Applying the ×55 version to real
  coordinates is badly wrong (a real 50km gap would come back as ~2,750km).

Selection is per-DC via each DC record's `isReal` flag, not per-plan — a route mixing real and
legacy DCs is an unsolved edge case (see gap #3 below), not currently possible via normal use.

## Known gaps

1. **Mode 1 (Design Input ingestion) not built.** Volume/Node master uploads are still
   cosmetic stubs (see "Current state" above); there is no run-generation/optimiser step
   anywhere in this codebase — `triggerRuns()` is cosmetic in both this fork and main. By
   explicit decision, no solver is being built; Mode 1's scope (when built) is bounded at
   making the Design Input masters genuinely ingestible, not at producing a plan.
2. ~~Finalise-commit flattens real DCs to bare code strings, losing real data~~ — **fixed
   2026-07-24** (see changelog). `computeHypotheticalPlan`'s route object now returns
   `dcRecords` (full real per-DC records incl. `isReal`, `resolvedLeg`); `confirmFin` and the
   Finalise preview both use it directly instead of re-deriving via `genDcRows`.
3. **Edge case, not solved**: a route mixing real-ingested DCs with legacy-synthetic DCs (e.g.
   a hypothetical future cross-plan merge via Ops feedback) is geometrically nonsensical
   regardless (real and fake coordinate systems don't align) and isn't fully guarded against.
   Not expected before a genuine solver/cross-plan-merge feature exists.
4. `aSel.hwLabel` / `oSel.hwLabel` are referenced in JSX (Ops Alignment "Historical weight"
   line) but never actually assigned in either repo's object builders — confirmed pre-existing
   in main too, not something this fork regressed. Not fixed, low priority.
5. Main's own `context.md` lists Breakdown TAT / Out Cutoff as Ops-Lead-flaggable cells — that
   is stale documentation in main itself; neither repo's actual feedback model has ever
   supported editing those fields. Not a functional difference between the two repos, don't
   relitigate it as one.

## Supabase migration history — run in this order if standing up a fresh project

| Order | Reference name | What it does |
|---|---|---|
| 1 | `01_core_schema_and_rls` | Core tables (`profiles`, `plans`, `plan_reviewers`, `plan_row_feedback`, `plan_reviewer_status`) + base RLS |
| 2 | `02_planner_sees_all_reviewer_tags` | Any planner sees who's tagged on any plan |
| 3 | `03_prevent_self_tagged_review` | Blocks a plan's creator from being tagged as its own reviewer |
| — | ~~`04_equal_planner_edit_rights`~~ | Superseded by #4 below — skip |
| 4 | `05_acknowledge_finalize_unfreeze_flow` | The real Pending → Acknowledged → Finalized flow, as three dedicated functions; `status` locked from direct client edits |
| 5 | `06_acknowledge_threshold_and_terminal_finalize` | Acknowledge needs ≥1 reviewer submitted (not all); Finalized is truly terminal, no unfreeze from there |
| 6 | `07_equal_planner_tag_management` | Any planner can manage tags on any plan; a planner can never be tagged as a reviewer (general rule, not just self-tagging) |
| 7 | `08_sc_default_reviewers` | `sc_reviewers` table — SC Master's default reviewer list |
| 8 | `09_plan_snapshots` | The 3-file naming/versioning table (see below) |
| — | `admin_readonly_role` | Still parked/deferred, not run |

**Plan-snapshot naming** — exactly 3 named rows per plan in `plan_snapshots`:
1. `{name}` at push (stage `ingested`) — for an ingested plan, `{name}` = the file's Run ID
   directly (already matches this format, e.g. `SBLS_20260716_142020`); for a Network-Map-driven
   plan, generated at push time.
2. `{name}_FEEDBACK` at each feedback submission (overwrites in place, doesn't grow).
3. `{name}_FINALISED` at Finalise. Acknowledge does not create a new file (same `_FEEDBACK`
   file, frozen). Finalise Directly skips stage 2 — only `{name}` and `{name}_FINALISED` exist.

## Architecture essentials

- No build step. Babel compiles the JSX in-browser at page load. Validate any edit with a
  Babel-based syntax checker (`sourceType: 'script'` to tolerate the top-level `with`) before
  considering a change done.
- `with (B) { ... }` binding pattern in `View()` — every JSX identifier must exist as a
  property on the object returned by `renderVals()`/its sub-`*Vals()` methods, in the same
  render pass, or the screen silently blanks.
- `computeHypotheticalPlan(plan, effectiveFbByIdx)` — single source of truth for
  distance/cost/CPS/validation, **and** for which DCs are real (`dcRecords[].isReal`) and what
  distance is real (`dcRecords[].resolvedLeg`, `userDistanceIsIngested`). Read these rather
  than re-deriving elsewhere.
- `effectiveFbFor(plan)` vs raw `row.fb` — always read proposed changes through
  `effectiveFbFor(plan)`, never raw `row.fb`/`r.fb` directly.
- Acting Ops-Lead persona switcher (pre-Supabase demo workaround) has been **retired** — real
  per-user login replaced it. If you see references to a persona switcher anywhere, that's
  dead/superseded, not a current feature.

## Working-style notes for this project

- Discuss non-trivial changes before executing — lay out the plan, wait for a response.
- Prefer additive, clearly-labelled changes over rewriting existing code/SQL.
- Prefer surgical, targeted edits over wholesale file rewrites given the file's size.
- Validate every edit with the syntax checker; re-run the RLH ingestion regression test (a
  real 571-row sample) after any change touching `genDcRows`, `computeHypotheticalPlan`,
  `doPush`, or `confirmFin` — it has caught real bugs more than once, don't skip it.
- **Keep this file reconciled, not just appended to.** A dated changelog entry describing a
  fix is only useful if earlier entries that it supersedes get corrected or struck through in
  place (see gap #2 above for the pattern) — otherwise the file accumulates contradictions
  that cost more time to untangle than a rewrite would have saved.

---

## Changelog (historical — dated entries, oldest first)

### 2026-07-14 — Skeleton build for zero-data UAT
Forked from main; `buildSeed()` emptied (Sort Centres, Plans, AutoDML/ingestion/volume-file
history, SC Vehicle Availability all → 0; Vehicle Master kept at its 8 canonical types as real
system config, since the cost engine needs it to compute anything). Fixed a few empty-data
crash points (constructor's `reviewSC`/`mapSC` null-safety, `opsSubmitted`'s hardcoded demo
IDs, Map Visualization's empty-state guard). Design Review/Design Creation/Ops Alignment
verified by tracing code (not live click-through) to already handle empty data safely.

### 2026-07-23 — Supabase landed; RLH Plan Ingestion (Mode 2) built
Real Supabase auth, the full Ops Alignment lifecycle, `sc_reviewers`, and `plan_snapshots` all
landed (see "Current state" and migration table above — this entry originally said these
"landed between [the last version] and this session" without saying what changed; that detail
has now been folded into the current-state section above rather than left as a dangling
reference). RLH Plan Ingestion (Mode 2) built as a real pipeline (see dedicated section
above). At the time, this entry flagged the Finalise-commit DC-flattening issue as a known,
not-yet-fixed gap — **that was fixed the next day, 2026-07-24, see below.**

### 2026-07-24 — Six parity fixes ported from the main prototype
Following a systematic diff against `V2.0-RLH-Design-Central`, six confirmed gaps fixed to
bring this fork back in line with production behaviour:
1. **Screen-jump bug** (Planner + Ops Lead) — `curId`'s validity check now tests against the
   full plan set (`plans`/`assigned`), not the tab-filtered list. Previously, an action that
   moved a plan to a different status tab bounced the user to an unrelated plan.
2. **Touch-point auto-reorder tie-break was direction-blind** — `computeHypotheticalPlan`'s
   route sort now distinguishes moving a DC earlier (insert-before) from later (insert-after),
   via a new `originalTp` field on the flattened DC record.
3. **Planner's Ops Alignment rail now has 4 stages**, not 3 — `Acknowledged` split out of
   `Feedback Received` into its own tab, matching the Ops Lead rail.
4. **Mandatory + reset Touch Point** when moving a DC into a new/not-yet-committed route.
5. **Finalise confirmation is now a full-screen tabbed preview** (Plan Details / Route View),
   replacing the old modal. Building this surfaced and fixed the DC-flattening data-loss bug
   flagged the day before (see gap #2 above): `computeHypotheticalPlan`'s route object now
   returns `dcRecords` (full real per-DC records) and each DC gets a `resolvedLeg` (actual
   distance used); `confirmFin` and the preview both use `dcRecords` directly instead of
   re-deriving via `genDcRows`. Caught two follow-on bugs during verification before shipping:
   an `isReal` discriminator that would have wrongly forced the real-coordinate haversine
   formula onto legacy synthetic DCs, and a missing `returnLeg` carry-forward through commit.
   Verified end-to-end: ingest → push → finalise → re-read all show identical, correct real
   distance with zero errors.
6. **Unified L4 structure** (Plan Inputs → Plan Outputs → Validation Flags → Plan Details)
   applied to Design Review, Ops Alignment Planner, and Ops Alignment Ops Lead. Design Review
   needed a real restructure (flattened an old nested Detail-View/Route-View inner toggle).
   Ops Alignment already had nearly everything built, including a distance-variance banner
   more advanced than main's (working Accept/Revert buttons vs. main's read-only text) — the
   real gap was section *ordering* (lifecycle banners to the top, tab strip below Validation
   Flags), not missing data.

### 2026-07-24 (later same day) — SC Master data-integrity fixes, found during first real-data UAT pass
User began ingesting real SC nodes via Add/Edit SC and found the SC Master list silently
discarding or misrepresenting real input. Root cause across all three: the SC Master list view
(`scRows` in `adminMasterVals`, formerly with inline hash-derivation) was originally built to
make ~80 *fabricated* seed SCs look plausible, and was never updated once `submitAddSc()` began
accepting real form input — the list kept fabricating values instead of reading what was
actually saved. Three concrete symptoms, all now fixed:
1. **SC Type always showed FMSC regardless of form selection.** `submitAddSc()` never stored
   `f.type` at all, and the list derived a displayed `scType` from a `dcCount >= 170/110` scale
   heuristic — a freshly-added SC always starts at `dcCount: 0`, so it always fell into the
   `else → FMSC` bucket no matter what was picked. Fixed: `type` is now stored on save (both new
   and edit paths) and read directly in the list (`s.type`, falling back to `—` only for the
   pre-existing fabricated seed SCs, which never had a stored type to begin with). `openScEdit`
   also no longer hardcodes `type: 'LMSC'` on reopen.
2. **POC name entered under the form didn't appear in the POC list or on edit-reopen.** Two
   compounding bugs: (a) only 4 of the form's 8 contact fields (`opsZh/opsCh/opsAm1/opsAm2`)
   were ever read into storage — the 4 "LH Ops …" fields were silently dropped on save; (b) even
   the 4 that were captured were stored as a flat, blank-filtered array with no role tag, so
   `openScEdit` remapped them back onto form fields **by array position** — if an earlier field
   was left blank, a later-filled name would reopen under the wrong role entirely (looked like it
   vanished from where it was typed). Fixed by introducing `SC_POC_FIELDS`, a canonical 8-entry
   `[key, role]` list shared by `submitAddSc`, `openScEdit`, and the list's POC dropdown builder.
   POCs are now stored as an object keyed by field name (e.g. `{ opsZh: 'Name', lhOpsAm1: '' }`),
   so a value can never shift to a different role and all 8 fields are captured, not 4.
3. **NLH/RLH Docks, Local/Non-Local TP Limit, and Opening/Closing Time were also fabricated**,
   not just Type — same root pattern, found while fixing #1. The list derived all six from a hash
   of the SC code (`s.code.split('').reduce(...)`), completely ignoring whatever the Add/Edit SC
   form actually submitted. Fixed: `submitAddSc()` now stores `localTp`/`nonLocalTp`/`open`/
   `close`/`nlhDocks`/`rlhDocks` explicitly (previously NLH+RLH docks were combined into a single
   `docks` sum with no split retained, and the other four weren't stored at all); the list reads
   these directly, showing `—` only where genuinely never entered.

**Explicitly deferred, by user request** — this pass fixes storage/display *within session
state only*; it does **not** add Supabase persistence for SC Master or Vehicle Master. That
gap (SC data lost on refresh, flagged the same session) is unchanged and still real — schema
design for `sc_master`/`vehicle_master`-equivalent tables is a separate, upcoming discussion.
User also confirmed no fabricated/demo data is needed on this panel going forward, so the ~80
seed SCs are expected to show `—` for Type/TP-limits/Hours (they predate all of these fields)
rather than a fabricated guess — this is intentional, not a regression.

**Not yet done, worth a click-through**: Vehicle Master (`submitAddVeh`) has the exact same
"real form input silently discarded/fabricated" risk pattern as SC Master did — it wasn't
audited this pass since the user's report was SC-Master-specific. Worth a dedicated check next.

### 2026-07-24 (later same day) — Four masters rebuilt against real templates, real CSV pipelines
User supplied real Excel templates (2-4 metadata rows: Mandatory/Optional, Input Format,
Validation Rule, Column Name, with real data starting after) for four masters in sequence:
Node Additions/Closures/Migrations, Vehicle Master, Sort Centre Master, and SC Vehicle
Availability. Working method for each: read the template's real column list + validation
rules, reconcile the existing form/list against it (match what exists, drop what doesn't
belong, add what's missing), then build a real CSV bulk-upload pipeline where requested.
Supabase SQL (schema + planner-only RLS) delivered per-master as each was finished; code
changes batched and delivered together at the end of the round (this handoff).

**1. Node Additions/Closures/Migrations** — `uploadNodeChanges()` was a cosmetic stub (never
read the file); replaced with a real `parseNodeChangesCsv` → `validateNodeChangeRows` →
`buildNodeChangeRows` → `uploadNodeChanges()` pipeline. Template: LMSC Code, LMDC Code, Node
Flag (Addition/Closure/Migration), LMDC Latitude, LMDC Longitude. Confirmed with user: Lat/Long
mandatory-ness follows the template's *conditional* Validation Rule (Addition: mandatory;
Closure/Migration: optional-but-validated-if-given), not its blanket "Mandatory" tag on those
two columns — a real inconsistency in the template itself, resolved in the app's favor of the
more specific rule. A Migration row's LMSC Code is the **destination** SC (DC retagged there,
dropped from its old SC — old-SC resolution deferred, not built). LMSC Code is explicitly NOT
cross-checked against SC Master this pass (user decision — flagged as a future enhancement).
The existing "Template" download button was stale (wrong 9-column format matching nothing);
fixed to the real 5 columns. `nodeChangeCount` was summing three dead legacy arrays nothing
populated — now reads the real uploaded data (`nodeChangesUnified`) directly. New row-error
modal (`nodeErrModal`) added, cloned from the RLH ingestion pattern. **The panel's view/table
already matched the template exactly — zero changes needed there.**
SQL: `10_node_changes_master.sql` (table + planner-only RLS; corrected mid-session from an
initially-too-open `select` policy to fully planner-only, per explicit user instruction that
ALL masters are visible/editable to the planner persona only, no ops_lead access at all).

**2. Vehicle Master** — reconciled against a 5-column template (Vehicle Type, Capacity
(Shipments), Distance Limit (Kms), Touch Point Limit, LH Feasibility). Vehicle Type converted
from free-text to a fixed 10-option dropdown (`VEH_TYPE_OPTIONS` — the exact truck-size list
from the template's Validation Rule), applied both to the Add form and the inline row-rename
control. Removed TP Local / TP Non-Local entirely (form fields, `submitAddVeh()`, inline-edit
draft/save logic) — not in this template, unlike SC Master's own (different) TP Limit fields.
Relabeled fields to the template's exact column names. List view already matched — no changes
needed. Per explicit user instruction, cleared the 8 fabricated seed vehicle types
(`VEH: []`) — verified first that every `d.VEH` read in the codebase already guards with
`|| []`/`|| {}`, so this doesn't crash anything; dependent dropdowns (Design Creation, Ops
Alignment) just show no options until real fleet data is entered. No CSV upload built here,
per explicit user instruction (single-entry form only, matching the template's intent).
SQL: `11_vehicle_master.sql` (table + planner-only RLS incl. `update`, since Vehicle Master
edits in place rather than replacing wholesale; `vehicle_type` UNIQUE + CHECK-constrained to
the 10 template values).

**3. Sort Centre (SC) Master** — reconciled against a 21-column template. Found: Local/
Non-Local TP Limit were marked required in the form but are Optional per template (with a
non-blocking "Max=7" warning, not a hard cap) — fixed. The 8 POC/contact fields have a real
email-format rule in the template (4 mandatory: SC/SC-LH Ops ZH and CH; 4 optional-but-
validated-if-filled: the AM-1/AM-2 variants) that the form never enforced at all — added
`NDC_isValidEmail()` and wired it into `submitAddSc()` as a **hard block** (user's explicit
choice) for both the mandatory and optional-but-present cases, plus a required-asterisk on the
4 mandatory contact labels. Found and fixed another instance of the exact same "form field
never actually saved" bug class from earlier this session: "SC City,State" existed in the Add
SC form but was never read into `submitAddSc()`, never restored in `openScEdit()`, and the
list's `cityState` column was always a fabricated zone-derived guess, never the real input —
now stored, restored, and displayed for real. Built a real bulk CSV pipeline
(`parseScMasterCsv`/`validateScMasterRows`/`buildScMasterRows`/`uploadScMasterFile`) — SC
Master previously had *no* bulk upload at all, only single-entry Add/Edit. Upsert-by-SC-Code:
an already-existing code is routed through the same `scEdits` overlay the single-entry Edit
form uses (update); a new code is added fresh — the template didn't specify update-vs-insert
semantics for a re-uploaded code, this was a judgment call, flagged to the user as such. Fixed
the stale template-download column list to the real 21 columns.
SQL: `12_sc_master.sql` (table + planner-only RLS incl. `update`; email columns get the same
regex CHECK at the DB level as the app's JS validator, so the hard-block rule holds even
against a direct API call; `local_tp_limit`/`non_local_tp_limit` intentionally have NO DB
constraint capping at 7, since that's a soft app-side warning, not a hard rule).

**4. SC Vehicle Availability** — reconciled against a 7-column template (SC Code, Vehicle
Type, Capacity (Shipments), Distance Limit (Kms), Vehicle Count, Touch Point Limit, Zone
Feasibility). This tab was already far more built than the others (add-form + inline-edit
table with all 7 fields, including Zone Feasibility as Local/Non-Local/Both — already an exact
match), but two real bugs surfaced:
  - **Shared-handler bug, found across three tabs at once**: SC Master's "Upload CSV", this
    tab's "Upload CSV", and RLH Plan Ingestion's "Ingest CSV" buttons were ALL wired to the
    exact same `uploadFile` handler (`ingestRlhPlanFile()`). SC Master's and this tab's upload
    buttons have therefore always silently run the wrong pipeline, every time, since before
    this session. Each now has its own dedicated handler.
  - **Architectural gap**: this tab's per-SC cards were built by mapping over `d.scVehAvail`,
    a seed array that's always empty in this real-data build (no seed data exists here at
    all) — meaning NO SC, old or newly-added via SC Master, ever got a card to add vehicles
    to, independent of any CSV work. Fixed by deriving the card list from the real merged SC
    list (`addedScs` + `data.scs`, honoring `scRemoved`) instead, with any base rows already
    in `d.scVehAvail` (e.g. future Supabase-loaded data) merged in by SC code where present.
    Also fixed `scByCode()` the same way — it only ever checked `data.scs`, never `addedScs`,
    so a manually-added SC's sort-capacity/node-count never displayed on its own card header.
  Removed the "Within Limit" column per explicit user instruction (computed indicator, not a
  template field) — header cell, row cell, grid-column count, and the now-dead `vmLabel`/
  `vmBg`/`vmFg` computation all removed (a near-identical block exists in Design Creation's
  own separate vehicle-configuration step — confirmed that's an unrelated feature and left
  untouched). Built a real bulk CSV pipeline (`parseAvailCsv`/`validateAvailRows`/
  `buildAvailRows`/`uploadAvailFile`) using the SC Vehicle Availability sheet as its own
  template. Vehicle Type is hard-validated against Vehicle Master (the template's own stated
  rule). SC Code is ALSO hard-validated against SC Master here — a deliberate difference from
  the Node Changes precedent (there, an unresolved LMSC was left as a future enhancement)
  because this tab's cards are now derived strictly from real SCs, so an unresolvable code
  would mean the row silently attaches nowhere and vanishes rather than just being
  unvalidated. Capacity/Distance Limit/Touch Point Limit default from the matched Vehicle
  Type's Vehicle Master values when left blank (confirmed with user); Vehicle Count defaults
  to 1; Zone Feasibility defaults to "Both". Upload is full-override ("latest upload replaces
  all prior records," matching existing UI copy) — clears `availAdded`/`availEdits`/
  `availRemoved` and rebuilds fresh, same pattern as Node Changes. Fixed the stale 4-column
  template download to the real 7 columns.
SQL: `13_sc_vehicle_availability.sql` (table + planner-only RLS). Unlike `node_changes.lmsc_code`
(deliberately free-text, since SC Master didn't exist as a table yet at that point), this table
gets REAL foreign keys now that both `sc_master` and `vehicle_master` exist: `sc_code` → CASCADE
on SC deletion (availability is meaningless without its SC), `vehicle_type` → RESTRICT on
Vehicle Master deletion (won't silently orphan availability data). Run order matters:
`11_vehicle_master.sql` and `12_sc_master.sql` must both run before this one.

**Standing pattern across all four SQL files**: every master is planner-only across
select/insert/update/delete — no ops_lead access at all, per explicit user instruction
partway through this round (corrected `node_changes`'s initially-too-open select policy
accordingly, and applied planner-only from the start to the other three).

**Not built this round, explicitly out of scope or deferred**:
- No app code wired to any of the four new/updated Supabase tables yet — schema-only, as
  agreed. All four masters remain session-state-only in the running app for now.
- No atomic replace-on-upload (Node Changes, SC Vehicle Availability) — currently a plain
  delete-then-insert from the client, not a single transaction. Flagged as an available
  enhancement (a `replace_x(rows jsonb)` Postgres function, mirroring `acknowledge_plan`/
  `finalise_plan`) in both relevant SQL files' notes.
- No audit history on Node Changes or SC Vehicle Availability's override-on-upload — each
  upload fully replaces the last with nothing kept. Flagged in both SQL files' notes.
- SC Code is not cross-checked against SC Master in Node Changes' validator (explicit user
  decision) — but IS cross-checked in SC Vehicle Availability's validator (different call,
  reasoned above). Worth remembering these two intentionally differ.

### 2026-07-24 (later same day) — All 4 masters + RLH pre-push wired to real Supabase
User tested Vehicle Master, found data lost on refresh — confirmed this was the explicitly
deferred gap (schema existed, app code didn't read/write it), not a regression. Wired real
Supabase read/write for all 4 masters plus a fifth item (RLH Plan Ingestion's pre-push state),
per user's explicit request. Answers locked in before building: load all 4 at the same point
auth resolves (mirroring the existing `loadPlansFromSupabase` pattern); writes are
wait-for-confirm (button disabled + "Saving…" while in flight, not optimistic); ops_lead gets
no access to these screens at all (**already true** — `opsNav` only ever contained Ops
Alignment + Network Map, confirmed by reading the nav construction code, nothing to build);
Node Changes' and SC Vehicle Availability's upload-replace is the simple client-side
delete-then-insert (the atomic Postgres-function alternative was explained and explicitly
declined — accepted risk: a failed insert after a successful delete leaves the table empty).

**Loading** — `loadMastersFromSupabase()` fetches `sc_master`/`vehicle_master`/`node_changes`/
`sc_vehicle_availability` in parallel and reconstructs each into the exact shapes the rest of
the app already expects (`data.scs`/`data.VEH`/`data.nodeChangesUnified`/`data.scVehAvail`) —
every existing overlay/builder (`scEdits`, `vehEdits`, `scRows`, `vehMaster`,
`scVehAvailRows`) needed zero changes, since they already treated these as "the base list"
regardless of where it came from. Availability rows resolve their Capacity/Distance/TP Limit
defaults against the freshly-loaded Vehicle Master **at load time**, matching how
`buildAvailRows()` already does it for a CSV upload — the existing display code reads these as
concrete values, it doesn't re-resolve against Vehicle Master itself. Called from
`loadAuthProfile()`, planner-only (`ops_lead` can't reach these screens and is blocked by RLS
regardless, so no point fetching).

**SC Master** — `submitAddSc()` now does a real upsert-by-`sc_code` (`saveScMasterRow`/
`scToDbRow`), replacing the old `scEdits`/`addedScs` local-only bookkeeping entirely: a
successful write refetches all 4 masters rather than patching local overlays, so there's a
single source of truth rather than two systems that could drift. Row delete
(`confirmDelete('sc')`) now issues a real `DELETE`. The bulk CSV upload (`uploadScMasterFile`)
was **still local-only from the previous session's build** — found and fixed this pass too:
now does one batch `upsert()` call for the whole file via `upsertScMasterRows`.

**Vehicle Master** — `submitAddVeh()` now does a real upsert-by-`vehicle_type`
(`saveVehicleMasterRow`); the modal's own `addVehEditName` edit branch was dead code anyway
(never reachable from the UI — only the inline row-edit is a real edit path), so this
simplified rather than complicated the function. Inline row-edit save now writes for real too,
handling a type-reassignment via the dropdown as delete-old+insert-new (`vehicle_type` is the
unique key). Row delete now issues a real `DELETE`.

**Node Changes** — `uploadNodeChanges()` now does the agreed simple delete-then-insert
(`replaceNodeChanges`) against `node_changes`, wait-for-confirm.

**SC Vehicle Availability** — same delete-then-insert pattern for the bulk CSV upload
(`replaceAvailability`). Also found and fixed, beyond what was explicitly discussed: the
**individual** per-SC "Add Vehicle" inline form, row-edit save, and row-delete on this tab
were all still session-state-only (`availAdded`/`availEdits`/`availRemoved`) from the previous
session's build. Left as-is, this would have reintroduced the exact bug class that started
this whole conversation, just less obviously — e.g. deleting a row would only hide it locally;
on refresh, the row reloads straight from Supabase (since it was never actually deleted there)
and silently reappears. All three now write for real (`saveAvailabilityRow`/
`deleteAvailabilityRow`), same delete-old+insert-new handling for a type reassignment as
Vehicle Master.

**Deletion UX change, worth knowing about**: SC Master's and Vehicle Master's row-delete
previously used a "soft-remove with an Undo button on the toast" pattern (nothing was actually
removed until/unless the undo window was ignored — meaningless when nothing was persisted
anyway). Now that delete is a real, already-confirmed (via the existing delete-confirmation
dialog) remote operation, the Undo button was dropped for these two specifically — offering an
undo on a completed remote delete would be misleading, since clicking it couldn't actually put
the row back. Replaced with a plain success/error toast. SC Vehicle Availability's individual
row-delete never had a confirmation dialog to begin with, so this change doesn't apply there in
the same way — flagging in case a confirm-before-delete step is wanted for consistency later.

**RLH Plan Ingestion pre-push persistence** — user also asked about this gap during the
Supabase discussion (an ingested-but-not-yet-pushed plan was lost on refresh, same bug class,
predates this session). Deliberately built as a **new, separate table**
(`rlh_ingested_plans`) rather than threading a pre-push state through the existing `plans`
table + its three RPC functions (`acknowledge_plan`/`finalise_plan`/`unfreeze_plan`) — those
are an already-working system whose RPC bodies and CHECK constraints aren't visible from the
app code alone, so extending that lifecycle carried real risk of breaking something already in
production use. `ingestRlhPlanFile()` now persists via `saveIngestedRlhPlanDrafts` (upsert-by-
`sc_code`, matching the app's own "re-ingesting an SC replaces its prior draft" behaviour);
`loadIngestedRlhPlanDrafts()` restores `ingestedRlhPlans` + the "Recently ingested" log on load;
`doPush()` now calls `deleteIngestedRlhPlanDraft(code)` once a plan is actually pushed into the
real `plans` table, so the draft table only ever holds the genuine not-yet-pushed gap.

SQL: `14_rlh_ingested_plans.sql` — planner-only RLS, same pattern as the 4 masters, no update
policy (a draft is only ever inserted fresh or deleted, never patched in place).

**Not built this pass**:
- The atomic replace-on-upload Postgres function (discussed, explicitly declined in favour of
  the simple approach) — still just the plain client-side delete-then-insert.
- No audit history on any override-on-upload table — unchanged from the prior round's notes.
- A confirm-before-delete step for SC Vehicle Availability's individual row removal, to match
  SC/Vehicle Master's existing confirmation dialog — flagged above, not built.

### 2026-07-24 (later same day) — Fixed a real-data bug: thousands-separator commas rejected as invalid numbers
User tested RLH Plan Ingestion against a real 571-row sample file and hit "Volume must be a
number > 0" errors on ~29 rows, all with volumes >= 1,000. Root cause: the sample file (and
presumably every real export from this system) quotes any numeric field over 999 with a comma
thousands-separator (e.g. `"1,286"`), which is valid CSV, but `Number("1,286")` evaluates to
`NaN` in JavaScript — every validator's `isNum()` check was rejecting these as invalid rather
than parsing them. Fixed at the parse stage in all four CSV pipelines built this session
(`parseRlhIngestCsv`, `parseScMasterCsv`, `parseAvailCsv`, `parseNodeChangesCsv`): numeric-
looking fields now have commas stripped (`numClean()`) before any validation or downstream use
sees them, so `"1,286"` becomes `"1286"` at the point of parsing, not scattered fix-ups later.
Verified against the actual sample file: unique LMSC codes are `D5LS, HBS, PYS, SBLS`; unique
Vehicle Types are `7FT Trailer, 8FT Trailer, 10FT Trailer` — **both cross-checked against SC
Master / Vehicle Master respectively**, so if either master doesn't yet have these exact
codes/types entered, ingestion will still correctly fail with a "not found" error (a separate,
expected gate, not a bug) rather than silently succeeding.

### 2026-07-24 (later same day) — Ingested plans now integrate into Design Review as real plan runs
User reported ingested files landing in Design Review as a flat, inert list — no zone filters,
no click-through, no metrics, no Push button. Traced the cause: Design Review's entire left-rail/
metrics-card/Push-Finalise machinery only ever considers an SC if it has ≥1 completed `d.runs`
entry (`completedSCs = d.scs.filter(s => completedRunsFor(s.code).length >= 1)`); ingested plans
were bolted on separately as a passive, non-interactive log below. Confirmed with the user this
UAT build has no real DS-optimiser backend — ingestion **is** the plan source here, standing in
for it — so the fix is to make an ingested plan satisfy the exact same shape a completed run
already uses, rather than build a parallel UI.

**What changed**:
- **`computeIngestedRunMetrics(ingested)`** — new shared method, extracted from logic that
  previously only ran inside `doPush()` at push time. Runs `computeHypotheticalPlan` against the
  ingested plan's raw rows and returns real routes/vehicles/distance/cps/cost/coverage/util,
  plus `flags` (reusing `computeHypotheticalPlan`'s own `errors`/`warnings`, already shaped
  `{t, sev}` — no mapping needed). `doPush()` now calls this shared method instead of duplicating
  the computation inline — same behaviour, single source of truth.
- **`reviewVals()`** — `completedRunsFor(code)` now also synthesizes a "virtual run" object per
  ingested SC (via a per-render-memoized `ingestedRunFor`), shaped exactly like a real `d.runs`
  entry (`id: 'ING-'+code`, `status:'Completed'`, `hw: null`, real metrics from
  `computeIngestedRunMetrics`, `isIngested: true`). Every downstream piece of this screen —
  `completedSCs`, `listSCs` (zone filter + search), `reviewList` (left rail), `planCards` (metrics
  grid + Push/Finalise) — needed ZERO changes; they already treat "the SC's completed runs" as
  the source of truth regardless of where a run object came from.
- **Fixed a real latent bug** found along the way: `hwLabelOf()`'s fallthrough silently mislabeled
  any non-0/0.5/1 value (including `null`) as "HW 1" instead of blank. Fixed so `hw: null` (used
  by every ingested virtual run) correctly renders as `—`, satisfying "show HW/RDR as blank/
  dashes" with no special-casing needed in the render layer — RDR and the CPS-vs-reference chip
  already only activate `if (hw > 0)`, so both correctly go blank/inactive automatically too.
- **Push / Finalise Directly / Download CSV all work with zero backend changes** — verified
  `doPush()` already prioritizes `ingestedRlhPlans[code]` over any run lookup when present, and
  `openPush`/`openFinDirect` already handle a null run ID gracefully.
- Uploader/date (`uploadedBy`/`uploadedAt`) are now stamped directly onto each ingested plan
  object at ingest time (`ingestRlhPlanFile`), so the virtual run's "Triggered by/at" fields are
  self-contained rather than requiring a lookup against the separate ingestion log.
- **Removed the old passive "Ingested Plans" block from Design Review** (JSX + the
  `reviewIngestedPlans`/`hasReviewIngested` vals it used) — per explicit user instruction, that
  list now only exists under Design Inputs → RLH Route Plan (untouched, still a simple upload
  log there, which is the right place for it).

**Explicitly deferred, not silently skipped** — two of the plan card's icon buttons
(`onMap`/`onDetail`, "Open on map" / "Open full plan detail") both look up their run by ID against
`d.runs` in code paths not touched this pass; wiring them for a synthesized ingested run is real,
separate work. Both are hidden (`hasMap`/`hasDetail: !r.isIngested`) on an ingested plan's card
for now rather than shipped half-working. Push, Finalise Directly, and Download CSV are fully
functional. Worth picking up as the next piece once this lands cleanly.

### 2026-07-24 (later same day) — "Open full plan detail" wired for ingested plans, real data throughout
User confirmed: (1) plan detail + map are both wanted next; (2) the detail view should simply
present the ingested plan through the *same* standard UI a regular run's detail view already
uses — not a bespoke ingested-specific layout; (3) map work comes after detail is solid, and
should render genuinely real geometry, not approximated.

Traced the existing detail view (`reviewDetail`, opened via the card's "Open full plan detail"
icon): for a regular run it fabricates a full route/DC breakdown via a seeded RNG
(`RR()`) from just the run's *aggregate* metrics, because a regular Network-Map run genuinely has
no real per-route/per-DC data to draw from — only a simulated summary. An ingested plan is the
opposite: it already has 100% real per-route and per-DC data (`routeCode`, `veh`, real `dcs[]`
with real `lat`/`lng`/`vol`/`tpOrder`, real `rtDist`) sitting in `ingestedRlhPlans[code].rows`
from the moment of ingestion. So "simply present it in the standard UI" meant: keep the exact
same `reviewDetail` shape/fields/layout, but populate it from the real ingested data instead of
running the RNG fabrication.

**What changed**:
- `detailRun` resolution now also checks the ingested virtual run for the currently-selected SC
  (`curIngestedRun`), not just `d.runs` — previously an ingested plan's synthesized id (`'ING-'+
  code`) was never found, so the detail view silently opened empty.
- The route/DC-row construction is now branched: `detailRun.isIngested` → build `dRouteRows`/
  `dcRows` directly from `ingestedRunFor()`'s `ingestedComputedRows` (the real per-route data,
  already enriched with volume/cps/util by `computeIngestedRunMetrics`); otherwise, the original
  RNG fabrication runs unchanged for a real (non-ingested) run. Out Cutoff / In Cutoff / per-row
  TAT show `—` for an ingested plan's DC rows — no real source for these three in the RLH
  ingestion template (same documented gap as the earlier Mode 2 build), not fabricated filler.
- Added `vehByType` (real per-vehicle-type route counts) to the ingested virtual run, so the
  "Vehicles used" section — previously always empty for an ingested plan, since that field
  didn't exist on the synthesized run object at all — now shows real data too.
- Fixed a second null-guard gap: the "Avg TAT" metric tile would have rendered the literal string
  "nullh" for an ingested plan (`avgTat: null` + `'h'`); now shows `—`.
- "Open full plan detail" is now enabled for ingested cards (`hasDetail: true` unconditionally);
  "Open on map" remains disabled (`hasMap: !r.isIngested`) — that's the next piece, per the user's
  own sequencing (detail first, map after).

**Real-data gap surfaced, worth flagging before the map work starts**: SC Master has no
Latitude/Longitude columns in its real template (confirmed when that master was built) — every
SC's `lat`/`lng` is hard-coded `0, 0` regardless of source (manual entry, CSV, or Supabase). DC-
level coordinates ARE genuinely real (straight from the ingested file), but each route's
*origin* point (`oLat`/`oLng`, stored per route in `buildIngestedRlhPlans` as `sc.lat`/`sc.lng`)
inherits that same `0, 0` placeholder. A "very real" map will correctly plot every DC's real
position, but routes will appear to originate from `(0, 0)` rather than the actual Sort Centre
location, unless SC Master gains real coordinate fields first. Flagging now, before map work
starts, rather than discovering it mid-build.

### 2026-07-24 (later same day) — SC Master gains real coordinates, closing the gap flagged above
User supplied a revised SC Master template adding exactly two mandatory fields — SC Latitude
(-90 to 90) and SC Longitude (-180 to 180) — inserted right after SC City,State; SC Vehicle
Availability's template is unchanged. This closes the gap flagged at the end of the previous
entry (every SC's coordinates were hard-coded 0,0, so route origins on the eventual map would
plot at the middle of the ocean regardless of how real the DC-level data was).

**What changed**: Add/Edit SC form gained SC Latitude/Longitude as hard-required fields (same
rigor as the email fields — missing or out-of-range blocks save with a toast, not a soft
warning, since bad coordinates directly corrupt the map). Wired through every layer that touches
an SC record: `submitAddSc()` validates and stores real values instead of the hardcoded 0,0;
`openScEdit()` restores them on reopen; the SC Master CSV pipeline
(`parseScMasterCsv`/`validateScMasterRows`/`buildScMasterRows`) parses, validates, and stores the
same two columns; `scToDbRow()`/`loadMastersFromSupabase()` map them to/from new
`sc_latitude`/`sc_longitude` Supabase columns; the template download includes them in the right
position. The SC Master list now shows real coordinates as a small sub-line under City/State.

**A precision bug avoided**: `buildScMasterRows()`'s existing `num()` helper truncates via
`parseInt` (fine for docks/capacities, which are always whole numbers) — using it for lat/lng
would have silently destroyed decimal precision (12.9716 → 12). Used `Number()` directly for
these two fields instead.

**The "not set" placeholder problem, handled consistently**: every SC created before this
migration has (0,0) sitting in the data (now NULL in Supabase, 0 in the app's normalized read).
Since (0,0) is technically a legal coordinate but is never a real Sort Centre location, both the
list display and the edit-form prefill treat an exact (0,0) pair as "never set" (showing `—` /
a blank form) rather than a real value — consistent with the "no fabricated data" pattern used
throughout this session, and avoids the edit form silently showing "0, 0" as if it were real.

**Zero code changes needed** in two places that will benefit automatically now that SC Master
carries real coordinates: `buildIngestedRlhPlans()` already reads `sc.lat`/`sc.lng` directly as
each route's origin point, and Design Review's plan-detail view already reads `dSC.lat`/`dSC.lng`
for its "SC coordinates" display — both already correct, they were just fed a placeholder before.

SQL: originally delivered as a separate ALTER (`15_sc_master_add_coordinates.sql`, nullable
columns, to avoid breaking already-saved rows). **Superseded same day** — user opted to delete
the existing `sc_master` table/policies/query and re-run a fresh, consolidated script instead of
layering an ALTER on top. `12_sc_master.sql` now includes `sc_latitude`/`sc_longitude` directly
in the `CREATE TABLE`, as `NOT NULL` (matching the template's "Mandatory" tag exactly, safe now
since it's a fresh table with no pre-existing rows to violate the constraint). The separate
ALTER file was deleted; only `12_sc_master.sql` needs to be re-run for this table going forward.
