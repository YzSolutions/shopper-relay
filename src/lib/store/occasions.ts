import { db } from "../db/client";

/** A date the owner set, with a job for the AI to shop for ahead of it. */
export interface Occasion {
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  job: string;
  daysAhead: number;
  shoppedAt: string | null;
  note: string | null;
  /** What the AI's shopping trip came to, if anything. */
  purchase: { id: string; state: string; title: string; amountCents: number } | null;
}

const MAX_PER_HOUSEHOLD = 12;

type Row = {
  id: string;
  title: string;
  on_date: string;
  job: string;
  days_ahead: number;
  shopped_at: string | null;
  note: string | null;
  purchase_id: string | null;
  p_state: string | null;
  p_title: string | null;
  p_cents: number | null;
};

const toOccasion = (r: Row): Occasion => ({
  id: r.id,
  title: r.title,
  date: r.on_date,
  job: r.job,
  daysAhead: r.days_ahead,
  shoppedAt: r.shopped_at && new Date(r.shopped_at).toISOString(),
  note: r.note,
  purchase: r.purchase_id && r.p_state ? { id: r.purchase_id, state: r.p_state, title: r.p_title ?? "", amountCents: r.p_cents ?? 0 } : null,
});

export async function listOccasions(householdId: string): Promise<Occasion[]> {
  // The date comes back as text so it never shifts with the server's time zone.
  const rows = (await db()`
    select o.id, o.title, o.on_date::text as on_date, o.job, o.days_ahead, o.shopped_at, o.note, o.purchase_id,
      p.status as p_state, p.product->>'title' as p_title, p.reviewed_cents as p_cents
    from occasions o left join purchases p on p.id = o.purchase_id
    where o.household_id = ${householdId} order by o.on_date, o.created_at`) as Row[];
  return rows.map(toOccasion);
}

/** Adds one, unless the household already has the most it can keep. Returns false then. */
export async function addOccasion(householdId: string, o: { title: string; date: string; job: string; daysAhead: number }): Promise<boolean> {
  const rows = await db()`
    insert into occasions (household_id, title, on_date, job, days_ahead)
    select ${householdId}, ${o.title}, ${o.date}::date, ${o.job}, ${o.daysAhead}
    where (select count(*) from occasions where household_id = ${householdId}) < ${MAX_PER_HOUSEHOLD}
    returning id`;
  return rows.length > 0;
}

export async function removeOccasion(householdId: string, id: string): Promise<void> {
  await db()`delete from occasions where id = ${id} and household_id = ${householdId}`;
}

/** Marks it as being shopped for. Only one caller ever gets it back, so it's shopped for once. */
export async function claimOccasion(id: string, householdId?: string): Promise<{ id: string; householdId: string; job: string } | null> {
  const rows = (await db()`
    update occasions set shopped_at = now()
    where id = ${id} and shopped_at is null and (${householdId ?? null}::uuid is null or household_id = ${householdId ?? null}::uuid)
    returning id, household_id, job`) as Array<{ id: string; household_id: string; job: string }>;
  return rows[0] ? { id: rows[0].id, householdId: rows[0].household_id, job: rows[0].job } : null;
}

/** Lets it be shopped for again (the run failed before it could finish). */
export async function releaseOccasion(id: string): Promise<void> {
  await db()`update occasions set shopped_at = null where id = ${id}`;
}

export async function finishOccasion(id: string, purchaseId: string | null, note: string | null): Promise<void> {
  await db()`update occasions set purchase_id = ${purchaseId}, note = ${note} where id = ${id}`;
}

/** Occasions whose shop-ahead day has come (on `today`, YYYY-MM-DD) and that haven't been shopped for. */
export async function dueOccasionIds(today: string, limit: number): Promise<string[]> {
  const rows = (await db()`
    select id from occasions
    where shopped_at is null and on_date - days_ahead <= ${today}::date and on_date >= ${today}::date
    order by on_date limit ${limit}`) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}
