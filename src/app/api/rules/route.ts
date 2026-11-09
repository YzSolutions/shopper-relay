import { z } from "zod";
import { questionFor } from "@/lib/ai/rules";
import { body, handle } from "@/lib/http";
import { FlowError } from "@/lib/purchases/service";
import { activeRules, changeWords, findRuleIssues, requestRuleChange, RuleSetSchema } from "@/lib/policy";
import { saveRulesState } from "@/lib/store/households";
import { currentRulesState, logRuleEvent } from "@/lib/store/ruleHistory";
import { assertSameHousehold, currentHousehold } from "@/lib/store/current";

export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    const state = await currentRulesState(household);
    return { owner: state.owner, rules: state.rules, pending: state.pending, active: activeRules(state), issues: findRuleIssues(state.rules) };
  });
}

/**
 * Save new rules. Rules with gaps or conflicts are refused until they're
 * resolved. Tightening applies at once; loosening follows the ownership
 * rules in requestRuleChange (cooling-off or reviewer approval).
 */
export async function POST(req: Request) {
  return handle(async () => {
    // No sign-in in the prototype, so the caller says which role it's acting as.
    const { rules, by, householdId } = await body(req, z.object({ rules: RuleSetSchema, by: z.enum(["shopper", "reviewer"]), householdId: z.uuid().optional() }));
    const household = await currentHousehold();
    assertSameHousehold(household.id, householdId);
    const names = { shopper: household.shopperName, reviewer: household.reviewerName };
    const issues = findRuleIssues(rules);
    if (issues.length) {
      return Response.json({ error: "Some amounts aren't covered yet.", questions: issues.map((i) => questionFor(i, names)), issues }, { status: 422 });
    }

    const before = await currentRulesState(household);
    const changed = requestRuleChange(before, rules, by);
    if (!changed.ok) throw new FlowError(changed.message, 403);
    // Someone shopping for themselves has no one else to wait for: their change applies now.
    const solo = household.shopperName === household.reviewerName;
    const result = solo ? { ...changed, state: { ...changed.state, rules, pending: null } } : changed;
    await saveRulesState(household.id, result.state);

    const who = by === "shopper" ? household.shopperName : household.reviewerName;
    const message = result.state.pending
      ? result.state.pending.autoActivateAt
        ? `${who} ${changeWords(result.summary)}. ${household.reviewerName} was told and can let it start now; otherwise it starts in 24 hours. Anything made stricter applies right away.`
        : `${who} asked to ${changeWords(result.summary, "ask")}. It waits for ${household.reviewerName} to approve.`
      : result.summary.kind === "none"
        ? `${who} saved the rules; nothing changed.`
        : `${who} updated the rules. The change applies right away.`;
    if (result.summary.kind !== "none") {
      await logRuleEvent(household.id, {
        type: "rules_changed",
        actor: by,
        message,
        change: { before: before.rules, after: rules, status: result.state.pending ? "waiting" : "applied" },
      });
    }
    return { state: result.state, summary: result.summary, notify: result.notify, message };
  });
}
