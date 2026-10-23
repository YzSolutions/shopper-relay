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
 * The prototype has no sign-in: one household per relationship type, created
 * with that relationship's default rules the first time it's needed.
 */
export async function demoHousehold(relationship: RelationshipId = DEMO_RELATIONSHIP): Promise<Household> {
  const found = (await db()`select * from households where relationship = ${relationship} order by created_at limit 1`) as Row[];
  if (found[0]) return toHousehold(found[0]);
  return createHousehold(relationship);
}

export async function createHousehold(relationship: RelationshipId): Promise<Household> {
  const r = RELATIONSHIPS[relationship];
  const [row] = (await db()`
    insert into households (relationship, shopper_name, reviewer_name)
    values (${relationship}, ${r.shopper.demoName}, ${r.reviewer.demoName}) returning *`) as Row[];
  await db()`
    insert into rules_states (household_id, owner, rules)
    values (${row.id}, ${r.ruleOwner}, ${JSON.stringify(r.defaultRules)}::jsonb)`;
  return toHousehold(row);
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

/** Start the demo over: delete the household (purchases, log and checks go with it) and recreate it. */
export async function resetHousehold(relationship: RelationshipId = DEMO_RELATIONSHIP): Promise<Household> {
  // Keep the hide-brands setting across resets, so a reset mid-recording doesn't reveal real names.
  const [prev] = (await db()`select hide_brands from households where relationship = ${relationship} limit 1`) as Array<{ hide_brands: boolean }>;
  await db()`delete from households where relationship = ${relationship}`;
  const fresh = await createHousehold(relationship);
  if (prev?.hide_brands) {
    await setHideBrands(fresh.id, true);
    return { ...fresh, hideBrands: true };
  }
  return fresh;
}
