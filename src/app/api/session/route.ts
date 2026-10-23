import { brand } from "@/config/brand";
import { RELATIONSHIP_IDS, RELATIONSHIPS } from "@/config/relationships";
import { handle } from "@/lib/http";
import { activeRules, findRuleIssues, settle } from "@/lib/policy";
import { householdBudget } from "@/lib/store/budget";
import { currentHousehold } from "@/lib/store/current";
import { getRulesState, saveRulesState } from "@/lib/store/households";

/** Everything the app needs to start: who's who, the rules in force, budgets, and PayPal's public client id. */
export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    const stored = await getRulesState(household.id);
    const state = settle(stored);
    if (state !== stored) await saveRulesState(household.id, state); // a waiting change came due
    const r = RELATIONSHIPS[household.relationship];
    const relationship = { id: r.id, tab: r.tab, title: r.title, summary: r.summary, controlNote: r.controlNote, ruleOwner: r.ruleOwner, payer: r.payer, flow: r.flow, otpa: r.otpa };
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
      paypal: { clientId: process.env.PAYPAL_CLIENT_ID ?? null, env: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox" },
      // The deployed commit (Vercel sets this), so testers can say exactly which build they saw.
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    };
  });
}
