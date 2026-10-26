import { db } from "../db/client";

/** The payer's saved PayPal, as PayPal's token for it. The token id never leaves the server. */
export interface Standing {
  paymentTokenId: string;
  /** PayPal itself; "card" only for the scripted sandbox tests. */
  method: "paypal" | "card";
  payerLabel: string | null;
  since: string;
}

type Row = { payment_token_id: string; method: Standing["method"]; payer_label: string | null; created_at: string };

export async function getStanding(householdId: string): Promise<Standing | null> {
  const [row] = (await db()`select payment_token_id, method, payer_label, created_at from standing_permissions where household_id = ${householdId}`) as Row[];
  return row ? { paymentTokenId: row.payment_token_id, method: row.method, payerLabel: row.payer_label, since: new Date(row.created_at).toISOString() } : null;
}

/** Save (or replace) the standing permission. Returns the token it replaced, if any, so it can be deleted at PayPal. */
export async function saveStanding(householdId: string, s: Omit<Standing, "since">): Promise<string | null> {
  const before = await getStanding(householdId);
  await db()`
    insert into standing_permissions (household_id, payment_token_id, method, payer_label) values (${householdId}, ${s.paymentTokenId}, ${s.method}, ${s.payerLabel})
    on conflict (household_id) do update
      set payment_token_id = excluded.payment_token_id, method = excluded.method, payer_label = excluded.payer_label, created_at = now()`;
  return before && before.paymentTokenId !== s.paymentTokenId ? before.paymentTokenId : null;
}

/** Turn it off. Returns the token that was removed, if any. */
export async function clearStanding(householdId: string): Promise<string | null> {
  const rows = (await db()`delete from standing_permissions where household_id = ${householdId} returning payment_token_id`) as Array<{ payment_token_id: string }>;
  return rows[0]?.payment_token_id ?? null;
}
