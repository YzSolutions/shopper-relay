-- Occasions (AI Shopper): dates the owner sets, like a birthday or an office
-- Secret Santa, with a job for the AI. A few days before each one, the AI goes
-- shopping on its own, within the owner's rules, like any other job.
create table occasions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  on_date date not null,
  -- What to find, in plain words: "a modern desk clock under $25".
  job text not null,
  -- How many days before the date the AI shops.
  days_ahead integer not null default 7 check (days_ahead between 0 and 60),
  -- Set once, when a run claims it, so the daily run and "Shop now" never both shop.
  shopped_at timestamptz,
  purchase_id uuid references purchases(id) on delete set null,
  -- What happened when no purchase came of it.
  note text,
  created_at timestamptz not null default now()
);
create index occasions_household on occasions (household_id, on_date);
create index occasions_due on occasions ((on_date - days_ahead)) where shopped_at is null;
