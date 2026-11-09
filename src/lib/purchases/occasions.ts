// Shopping ahead of an occasion: once its shop-ahead day comes (or Sarah taps
// "Shop now"), the AI Shopper takes the occasion's job like any other. It goes
// through the same rules and saved PayPal, so anything outside them still goes
// to the owner first.

import { logEvent } from "../store/events";
import { claimOccasion, dueOccasionIds, finishOccasion, releaseOccasion } from "../store/occasions";
import { getHousehold } from "../store/households";
import type { Purchase } from "../store/purchases";
import type { AgentStep } from "./agent";
import { runGoal } from "./goalAgent";

/** Shops for one occasion. Null if it was already shopped for (or is being shopped for now). */
export async function shopForOccasion(id: string, householdId?: string): Promise<{ steps: AgentStep[]; purchase: Purchase | null } | null> {
  const claimed = await claimOccasion(id, householdId);
  if (!claimed) return null;
  const household = await getHousehold(claimed.householdId);
  if (household?.relationship !== "ai_shopper") {
    await finishOccasion(id, null, "Only the AI Shopper shops for occasions.");
    return null;
  }
  try {
    const run = await runGoal(household, claimed.job);
    await finishOccasion(id, run.purchase?.id ?? null, run.purchase ? null : (run.steps.at(-1)?.text ?? "It found nothing within the rules."));
    await logEvent({
      householdId: household.id,
      purchaseId: run.purchase?.id ?? null,
      type: "occasion_shopped",
      actor: "agent",
      message: run.purchase ? `Shopped ahead for ${claimed.title}.` : `Shopped ahead for ${claimed.title}, and found nothing to buy.`,
    });
    return run;
  } catch (err) {
    await releaseOccasion(id); // the next run tries again
    throw err;
  }
}

/** The daily run: shops for every occasion whose day has come, a few at a time. */
export async function shopDueOccasions(today: string, limit = 5): Promise<{ shopped: number; failed: number }> {
  let shopped = 0;
  let failed = 0;
  for (const id of await dueOccasionIds(today, limit)) {
    try {
      if (await shopForOccasion(id)) shopped++;
    } catch (err) {
      console.error("occasion run failed", id, err);
      failed++;
    }
  }
  return { shopped, failed };
}
