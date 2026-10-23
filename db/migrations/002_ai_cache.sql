-- Saved AI answers, keyed by a hash of the task and its exact input. The same
-- question gets the same answer instantly, so a busy model can't stall a demo.
create table ai_cache (
  key text primary key,
  task text not null,
  model text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
