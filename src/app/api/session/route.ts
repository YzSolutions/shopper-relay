import { brand } from "@/config/brand";
import { RELATIONSHIPS } from "@/config/relationships";
import { handle } from "@/lib/http";
import { activeRules, findRuleIssues, settle } from "@/lib/policy";
import { demoHousehold, getRulesState, saveRulesState } from "@/lib/store/households";

/** Everything the app needs to start: who's who, the rules in force, and PayPal's public client id. */
export async function GET() {
  return handle(async () => {
    const household = await demoHousehold();
    const stored = await getRulesState(household.id);
    const state = settle(stored);
    if (state !== stored) await saveRulesState(household.id, state); // a waiting change came due
    return {
      brand,
      household,
      relationship: RELATIONSHIPS[household.relationship],
      rules: state.rules,
      pending: state.pending,
      active: activeRules(state),
      issues: findRuleIssues(state.rules),
      paypal: { clientId: process.env.PAYPAL_CLIENT_ID ?? null, env: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox" },
    };
  });
}
