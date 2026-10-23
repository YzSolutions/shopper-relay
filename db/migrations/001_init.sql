-- One household = one shopper/reviewer pair under one relationship preset.
create table households (
  id uuid primary key default gen_random_uuid(),
  relationship text not null,
  shopper_name text not null,
  reviewer_name text not null,
  created_at timestamptz not null default now()
);

-- Current rules plus any loosening still waiting (see RulesState in src/lib/policy/changes.ts).
create table rules_states (
  household_id uuid primary key references households(id) on delete cascade,
  owner text not null check (owner in ('shopper', 'reviewer')),
  rules jsonb not null,
  pending jsonb,
  updated_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  status text not null,
  -- Snapshot of what was shown when the shopper chose it.
  product jsonb not null,
  -- The total the shopper reviewed, in cents. PayPal's held amount must match it exactly.
  reviewed_cents integer not null check (reviewed_cents > 0),
  currency text not null default 'USD',
  category jsonb not null,           -- CategoryResolution
  recurring text not null check (recurring in ('yes', 'no', 'uncertain')),
  terms jsonb,                       -- AI findings about the purchase terms, if any
  decision jsonb not null,           -- latest Decision from the policy engine
  paypal_order_id text unique,
  paypal_authorization_id text unique,
  paypal_capture_id text unique,
  paypal_amount_cents integer,
  -- Secret for the reviewer's link. Only its hash would be needed in production.
  review_token text unique,
  review_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_household_created on purchases (household_id, created_at desc);

-- The why log: every step of every purchase and rule change, in order.
create table events (
  id bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,
  actor text not null,               -- shopper | reviewer | system | paypal
  message text not null,
  detail jsonb
);
create index events_household_at on events (household_id, at desc);
create index events_purchase_at on events (purchase_id, at);
