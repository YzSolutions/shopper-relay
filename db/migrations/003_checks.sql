-- "Check Before You Buy" results. The screenshot itself is never stored, only what was read from it.
create table checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  terms jsonb not null,
  created_at timestamptz not null default now()
);
