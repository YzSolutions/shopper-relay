import { z } from "zod";
import { parseRules } from "@/lib/ai/rules";
import { body, handle } from "@/lib/http";
import { settle } from "@/lib/policy";
import { getRulesState } from "@/lib/store/households";
import { currentHousehold } from "@/lib/store/current";

/**
 * Turn plain-English rules into structured rules, merged over the current
 * ones. Nothing is saved: the owner reviews the result and any questions
 * first, then saves through POST /api/rules.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { text, startFresh } = await body(req, z.object({ text: z.string().min(3).max(2000), startFresh: z.boolean().optional() }));
    const household = await currentHousehold();
    const current = startFresh ? { categories: {}, caps: [] } : settle(await getRulesState(household.id)).rules;
    return parseRules(text, { shopper: household.shopperName, reviewer: household.reviewerName }, current);
  });
}
