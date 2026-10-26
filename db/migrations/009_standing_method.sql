-- Which kind of payment method was saved: PayPal itself, or (scripted sandbox tests only) a test card.
alter table standing_permissions add column method text not null default 'paypal' check (method in ('paypal', 'card'));
