import { z } from "zod";
import { questionFor } from "@/lib/ai/rules";
import { body, handle } from "@/lib/http";
import { FlowError } from "@/lib/purchases/service";
import { activeRules, findRuleIssues, requestRuleChange, RuleSetSchema } from "@/lib/policy";
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
    const result = requestRuleChange(before, rules, by);
    if (!result.ok) throw new FlowError(result.message, 403);
    await saveRulesState(household.id, result.state);

    const who = by === "shopper" ? household.shopperName : household.reviewerName;
    const message = result.state.pending
      ? result.state.pending.autoActivateAt
        ? `${who} loosened a safeguard. ${household.reviewerName} was notified and can approve it now; otherwise it takes effect in 24 hours. Any tightening applies right away.`
        : `${who} asked to loosen a limit. It waits for ${household.reviewerName} to approve.`
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
