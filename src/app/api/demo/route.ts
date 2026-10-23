import { cookies } from "next/headers";
import { z } from "zod";
import { MODE_COOKIE, RELATIONSHIP_IDS } from "@/config/relationships";
import { body, handle } from "@/lib/http";
import { expireOverdue } from "@/lib/purchases/service";
import { settle } from "@/lib/policy";
import { currentHousehold, currentMode } from "@/lib/store/current";
import { logEvent } from "@/lib/store/events";
import { getRulesState, resetHousehold, saveRulesState, setHideBrands } from "@/lib/store/households";
import { shiftReviewDeadlines } from "@/lib/store/purchases";

// Demo-only controls, clearly labelled in the UI: switch relationship,
// pretend time has passed, start over, or hide real store and brand names.

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), mode: z.enum(RELATIONSHIP_IDS) }),
  z.object({ action: z.literal("advance"), hours: z.number().int().min(1).max(24 * 30) }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("hide_brands"), on: z.boolean() }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    if (a.action === "mode") {
      (await cookies()).set(MODE_COOKIE, a.mode, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
      return { mode: a.mode };
    }
    if (a.action === "reset") return { household: await resetHousehold(await currentMode()) };

    const household = await currentHousehold();
    if (a.action === "hide_brands") {
      await setHideBrands(household.id, a.on);
      return { hideBrands: a.on };
    }
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
