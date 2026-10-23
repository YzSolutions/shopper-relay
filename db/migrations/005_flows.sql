-- Who reviews each purchase (a category can have its own reviewer), how it is paid for,
-- and the One-Time Purchase Authorization for the personal-shopper flow.
alter table purchases add column reviewer_name text;
alter table purchases add column flow text not null default 'hold' check (flow in ('hold', 'request'));
alter table purchases add column otpa jsonb;
create index purchases_household_reviewer on purchases (household_id, reviewer_name) where status in ('awaiting_review', 'requested', 'hunting');
