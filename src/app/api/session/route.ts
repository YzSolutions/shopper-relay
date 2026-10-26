import { brand } from "@/config/brand";
import { RELATIONSHIP_IDS, RELATIONSHIPS } from "@/config/relationships";
import { handle } from "@/lib/http";
import { activeRules, findRuleIssues } from "@/lib/policy";
import { householdBudget } from "@/lib/store/budget";
import { standingView } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { currentRulesState } from "@/lib/store/ruleHistory";

/** Everything the app needs to start: who's who, the rules in force, budgets, and PayPal's public client id. */
export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    const state = await currentRulesState(household); // applies a waiting change that came due
    const r = RELATIONSHIPS[household.relationship];
    const relationship = { id: r.id, tab: r.tab, title: r.title, summary: r.summary, controlNote: r.controlNote, ruleOwner: r.ruleOwner, payer: r.payer, flow: r.flow, otpa: r.otpa, bills: r.bills };
    const active = activeRules(state);
    // Everyone who reviews something here: the main reviewer, and anyone a category names.
    const reviewers = [household.reviewerName, ...Object.values(active.categories).flatMap((r) => (r?.reviewer ? [r.reviewer] : []))];
    return {
      brand,
      household,
      relationship,
      relationships: RELATIONSHIP_IDS.map((id) => ({ id, tab: RELATIONSHIPS[id].tab, title: RELATIONSHIPS[id].title })),
      reviewers: [...new Set(reviewers)],
      owner: state.owner,
      rules: state.rules,
      pending: state.pending,
      active,
      issues: findRuleIssues(state.rules),
      budget: await householdBudget(household),
      // The payer's standing permission (request flow), if on. Only whether and since when, never PayPal's token.
      standing: r.payer === "reviewer" ? await standingView(household) : null,
      paypal: { clientId: process.env.PAYPAL_CLIENT_ID ?? null, env: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox" },
      // The deployed commit (Vercel sets this), so testers can say exactly which build they saw.
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    };
  });
}
