import type { AiTerms } from "../ai/terms";
import { db } from "../db/client";

export async function saveCheck(householdId: string, terms: AiTerms): Promise<string> {
  const [row] = (await db()`insert into checks (household_id, terms) values (${householdId}, ${JSON.stringify(terms)}::jsonb) returning id`) as Array<{ id: string }>;
  return row.id;
}

export async function getCheck(householdId: string, id: string): Promise<AiTerms | null> {
  const rows = (await db()`select terms from checks where id = ${id} and household_id = ${householdId}`) as Array<{ terms: AiTerms }>;
  return rows[0]?.terms ?? null;
}
