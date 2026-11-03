import { cookies } from "next/headers";
import { z } from "zod";
import { MODE_COOKIE, RELATIONSHIP_IDS } from "@/config/relationships";
import { tourFacts } from "@/config/tour";
import { body, handle } from "@/lib/http";
import { expireOverdue } from "@/lib/purchases/service";
import { currentHousehold, currentMode, currentVisitor } from "@/lib/store/current";
import { householdLog, logEvent } from "@/lib/store/events";
import { getRulesState, resetHousehold, saveRulesState, setHideBrands } from "@/lib/store/households";
import { currentRulesState } from "@/lib/store/ruleHistory";
import { listPurchases, shiftReviewDeadlines } from "@/lib/store/purchases";

// Demo-only controls, clearly labelled in the UI: switch relationship,
// pretend time has passed, start over, or hide real store and brand names.

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), mode: z.enum(RELATIONSHIP_IDS) }),
  z.object({ action: z.literal("advance"), hours: z.number().int().min(1).max(24 * 30) }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("hide_brands"), on: z.boolean() }),
]);

/** How far this visitor's demo has come, for the guided tour. */
export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    const [purchases, log] = await Promise.all([listPurchases(household.id, 200), householdLog(household.id, 500)]);
    return { facts: tourFacts(purchases, log.map((e) => e.type)), huntingId: purchases.find((p) => p.state === "hunting")?.id ?? null };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    if (a.action === "mode") {
      (await cookies()).set(MODE_COOKIE, a.mode, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
      return { mode: a.mode };
    }
    if (a.action === "reset") return { household: await resetHousehold(await currentVisitor(), await currentMode()) };

    const household = await currentHousehold();
    if (a.action === "hide_brands") {
      await setHideBrands(household.id, a.on);
      return { hideBrands: a.on };
    }
    await shiftReviewDeadlines(household.id, a.hours);
    const state = await getRulesState(household.id);
    if (state.pending?.autoActivateAt) {
      const shifted = new Date(Date.parse(state.pending.autoActivateAt) - a.hours * 3600_000).toISOString();
      await saveRulesState(household.id, { ...state, pending: { ...state.pending, autoActivateAt: shifted } });
      await currentRulesState(household); // starts it if its 24 hours are now up, and records that
    }
    await logEvent({ householdId: household.id, type: "demo_time", actor: "system", message: `Demo: simulated ${a.hours} hours passing.` });
    await expireOverdue(household);
    return { ok: true };
  });
}
