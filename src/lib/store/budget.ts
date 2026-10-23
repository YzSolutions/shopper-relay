import { activeRules, budgetSummary, type BudgetLine } from "../policy";
import { historyFrom } from "../purchases/lifecycle";
import { getRulesState, type Household } from "./households";
import { listPurchases, summarize } from "./purchases";

/** The household's weekly and monthly budgets with what's spent and reserved. Empty if there are no caps. */
export async function householdBudget(household: Household): Promise<BudgetLine[]> {
  const [state, purchases] = await Promise.all([getRulesState(household.id), listPurchases(household.id, 200)]);
  return budgetSummary(activeRules(state), historyFrom(purchases.map(summarize)));
}
