-- Bills for the shopper's time (Personal shopper). The goods are paid by the customer
-- directly; this is the shopper's own fee, sent as a PayPal invoice. PayPal holds the
-- invoice and takes the payment; we keep its id, the amount, and whether it's paid.
create table bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  paypal_invoice_id text unique,
  -- PayPal's own invoice number, shown to people.
  invoice_number text,
  amount_cents integer not null check (amount_cents > 0),
  note text not null,
  -- The purchases this bill covers, by id (for the description only).
  purchase_ids uuid[] not null default '{}',
  -- The link the customer follows to pay in PayPal.
  payer_url text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'canceled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  -- When we last asked PayPal whether it was paid.
  checked_at timestamptz
);
create index bills_household on bills (household_id, created_at desc);
