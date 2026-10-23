import { z } from "zod";
import { body, handle } from "@/lib/http";
import { expireOverdue } from "@/lib/purchases/service";
import { settle } from "@/lib/policy";
import { logEvent } from "@/lib/store/events";
import { demoHousehold, getRulesState, resetHousehold, saveRulesState } from "@/lib/store/households";
import { shiftReviewDeadlines } from "@/lib/store/purchases";

// Demo-only controls, clearly labelled in the UI: pretend a day has passed,
// or start the demo over.

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance"), hours: z.number().int().min(1).max(72) }),
  z.object({ action: z.literal("reset") }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    if (a.action === "reset") return { household: await resetHousehold() };

    const household = await demoHousehold();
    await shiftReviewDeadlines(household.id, a.hours);
    const state = await getRulesState(household.id);
    if (state.pending?.autoActivateAt) {
      const shifted = new Date(Date.parse(state.pending.autoActivateAt) - a.hours * 3600_000).toISOString();
      await saveRulesState(household.id, settle({ ...state, pending: { ...state.pending, autoActivateAt: shifted } }));
    }
    await logEvent({ householdId: household.id, type: "demo_time", actor: "system", message: `Demo: simulated ${a.hours} hours passing.` });
    await expireOverdue(household);
    return { ok: true };
  });
}
