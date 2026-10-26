import { RELATIONSHIPS, DEMO_RELATIONSHIP, type RelationshipId } from "@/config/relationships";
import type { RulesState } from "../policy";
import { db } from "../db/client";

export interface Household {
  id: string;
  relationship: RelationshipId;
  shopperName: string;
  reviewerName: string;
  /** Demo setting: show invented store names and no brand names (for the video). */
  hideBrands: boolean;
}

type Row = { id: string; relationship: RelationshipId; shopper_name: string; reviewer_name: string; hide_brands: boolean };
const toHousehold = (r: Row): Household => ({
  id: r.id,
  relationship: r.relationship,
  shopperName: r.shopper_name,
  reviewerName: r.reviewer_name,
  hideBrands: r.hide_brands,
});

/**
 * The prototype has no sign-in: each visitor (browser) gets one household per
 * relationship type, created with that relationship's default rules the first
 * time it's needed. Visitors never see each other's households.
 */
export async function demoHousehold(visitorId: string, relationship: RelationshipId = DEMO_RELATIONSHIP): Promise<Household> {
  const found = (await db()`select * from households where visitor_id = ${visitorId} and relationship = ${relationship}`) as Row[];
  if (found[0]) return toHousehold(found[0]);
  return createHousehold(visitorId, relationship);
}

export async function createHousehold(visitorId: string, relationship: RelationshipId): Promise<Household> {
  const r = RELATIONSHIPS[relationship];
  // One statement, so the household never exists without its rules. A page often
  // makes several first calls at once; whichever loses the race reads the winner's.
  const [row] = (await db()`
    with h as (
      insert into households (visitor_id, relationship, shopper_name, reviewer_name)
      values (${visitorId}, ${relationship}, ${r.shopper.demoName}, ${r.reviewer.demoName})
      on conflict (visitor_id, relationship) do nothing
      returning *
    ), rules as (
      insert into rules_states (household_id, owner, rules)
      select id, ${r.ruleOwner}, ${JSON.stringify(r.defaultRules)}::jsonb from h
    )
    select * from h`) as Row[];
  if (row) return toHousehold(row);
  const [existing] = (await db()`select * from households where visitor_id = ${visitorId} and relationship = ${relationship}`) as Row[];
  return toHousehold(existing);
}

export async function getHousehold(id: string): Promise<Household | null> {
  const rows = (await db()`select * from households where id = ${id}`) as Row[];
  return rows[0] ? toHousehold(rows[0]) : null;
}

export async function getRulesState(householdId: string): Promise<RulesState> {
  const [row] = (await db()`select owner, rules, pending from rules_states where household_id = ${householdId}`) as Array<{
    owner: RulesState["owner"];
    rules: RulesState["rules"];
    pending: RulesState["pending"];
  }>;
  if (!row) throw new Error("This household has no rules yet.");
  return { owner: row.owner, rules: row.rules, pending: row.pending };
}

export async function saveRulesState(householdId: string, state: RulesState): Promise<void> {
  await db()`
    update rules_states
    set owner = ${state.owner}, rules = ${JSON.stringify(state.rules)}::jsonb,
        pending = ${state.pending ? JSON.stringify(state.pending) : null}::jsonb, updated_at = now()
    where household_id = ${householdId}`;
}

export async function setHideBrands(householdId: string, on: boolean): Promise<void> {
  await db()`update households set hide_brands = ${on} where id = ${householdId}`;
}

/**
 * Start this visitor's demo over: delete their household (purchases, log and
 * checks go with it) and recreate it. Other visitors' households are untouched.
 */
export async function resetHousehold(visitorId: string, relationship: RelationshipId = DEMO_RELATIONSHIP): Promise<Household> {
  // Keep the hide-brands setting across resets, so a reset mid-recording doesn't reveal real names.
  const [prev] = (await db()`
    select hide_brands from households where visitor_id = ${visitorId} and relationship = ${relationship}`) as Array<{ hide_brands: boolean }>;
  await db()`delete from households where visitor_id = ${visitorId} and relationship = ${relationship}`;
  const fresh = await createHousehold(visitorId, relationship);
  if (prev?.hide_brands) {
    await setHideBrands(fresh.id, true);
    return { ...fresh, hideBrands: true };
  }
  return fresh;
}
