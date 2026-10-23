-- What PayPal actually took, as reported by the capture. Kept apart from the held amount:
-- a one-time purchase authorization holds the customer's maximum but captures only the price.
alter table purchases add column paypal_captured_cents integer;
