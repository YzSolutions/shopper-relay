import { db } from "../db/client";

/** `agent`: the AI shopper, buying under a one-time authorization. */
export type Actor = "shopper" | "reviewer" | "system" | "paypal" | "agent";

export interface LogEvent {
  id: number;
  householdId: string;
  purchaseId: string | null;
  at: string;
  type: string;
  actor: Actor;
  message: string;
  detail: unknown;
}

type Row = { id: string; household_id: string; purchase_id: string | null; at: string; type: string; actor: Actor; message: string; detail: unknown };
const toEvent = (r: Row): LogEvent => ({
  id: Number(r.id),
  householdId: r.household_id,
  purchaseId: r.purchase_id,
  at: new Date(r.at).toISOString(),
  type: r.type,
  actor: r.actor,
  message: r.message,
  detail: r.detail,
});

/**
 * Add a line to the why log. `by` names who acted when it isn't the household's
 * main reviewer (a category's own reviewer, like Dad); it's kept in the detail.
 */
export async function logEvent(e: { householdId: string; purchaseId?: string | null; type: string; actor: Actor; message: string; detail?: unknown; by?: string }) {
  const detail = e.by ? { ...(e.detail && typeof e.detail === "object" ? e.detail : {}), by: e.by } : e.detail;
  await db()`
    insert into events (household_id, purchase_id, type, actor, message, detail)
    values (${e.householdId}, ${e.purchaseId ?? null}, ${e.type}, ${e.actor}, ${e.message}, ${detail === undefined ? null : JSON.stringify(detail)}::jsonb)`;
}

export async function householdLog(householdId: string, limit = 100): Promise<LogEvent[]> {
  const rows = (await db()`select * from events where household_id = ${householdId} order by at desc, id desc limit ${limit}`) as Row[];
  return rows.map(toEvent);
}

export async function purchaseLog(purchaseId: string): Promise<LogEvent[]> {
  const rows = (await db()`select * from events where purchase_id = ${purchaseId} order by at, id`) as Row[];
  return rows.map(toEvent);
}
