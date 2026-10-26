-- Standing permission, for relationships where the reviewer pays (Kids + parent,
-- Personal shopper). The payer saves their PayPal with PayPal (Vault) once; then the
-- shopper can buy what the payer's own rules allow without asking each time. Only
-- PayPal's token id is kept here, never account details.
create table standing_permissions (
  household_id uuid primary key references households(id) on delete cascade,
  payment_token_id text not null,
  -- How to name the saved account on screen, e.g. the PayPal email PayPal reports.
  payer_label text,
  created_at timestamptz not null default now()
);

-- Purchases paid with a standing permission rather than approved one by one.
alter table purchases add column standing boolean not null default false;
