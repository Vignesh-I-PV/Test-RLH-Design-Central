-- ============================================================================
-- 14_rlh_ingested_plans.sql
-- RLH Plan Ingestion — pre-push draft persistence
-- Run this in the Supabase SQL editor.
--
-- WHY A SEPARATE TABLE: the existing `plans` table + its three RPC functions
-- (acknowledge_plan / finalise_plan / unfreeze_plan) are an already-working,
-- in-production lifecycle that predates this session. I don't have visibility
-- into those RPC function bodies or the `plans` table's CHECK constraints from
-- the app code alone, so rather than risk that working system by threading a
-- new pre-push "draft" status through it, this is a deliberately independent,
-- low-risk table. A row here is deleted the moment its plan is actually pushed
-- into the real `plans` table — this table only ever holds the not-yet-pushed
-- gap.
-- ============================================================================

create table if not exists public.rlh_ingested_plans (
  sc_code    text primary key,                 -- one draft per SC, matches the app's own model
  file_name  text not null,
  row_count  int not null,
  plan_data  jsonb not null,                    -- the full ingested plan object, as built by buildIngestedRlhPlans()
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.rlh_ingested_plans enable row level security;

-- Planner-only, same pattern as the 4 master tables.
create policy "rlh_ingested_plans_select_planner"
  on public.rlh_ingested_plans for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'planner')
  );

create policy "rlh_ingested_plans_insert_planner"
  on public.rlh_ingested_plans for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'planner')
  );

create policy "rlh_ingested_plans_delete_planner"
  on public.rlh_ingested_plans for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'planner')
  );

-- ============================================================================
-- Notes:
--
-- 1. Upsert-by-sc_code, matching the app's existing local behaviour: re-ingesting
--    a file for the same SC replaces its prior not-yet-pushed draft.
--
-- 2. No update policy — a draft is only ever inserted (fresh ingest) or deleted
--    (once pushed, or replaced by a fresh ingest via upsert, which uses insert
--    with onConflict, not a plain update).
--
-- 3. plan_data stores the whole plan object as JSON — same "wrap the existing
--    shape, don't redesign it" approach already used for `plans.data` and
--    `plan_snapshots.data`.
-- ============================================================================
