import { z } from "zod";
import { body, handle } from "@/lib/http";
import { FlowError } from "@/lib/purchases/service";
import { approvePendingChange, dropPendingChange, settle } from "@/lib/policy";
import { logEvent } from "@/lib/store/events";
import { getRulesState, saveRulesState } from "@/lib/store/households";
import { currentHousehold } from "@/lib/store/current";

/** The reviewer approves a waiting rule change, or it's withdrawn or turned down. */
export async function POST(req: Request) {
  return handle(async () => {
    const { action, by } = await body(req, z.object({ action: z.enum(["approve", "drop"]), by: z.enum(["shopper", "reviewer"]) }));
    const household = await currentHousehold();
    const state = settle(await getRulesState(household.id));
    if (!state.pending) throw new FlowError("There's no rule change waiting.", 409);

    if (action === "approve") {
      if (by !== "reviewer") throw new FlowError(`Only ${household.reviewerName} can approve a waiting change early.`, 403);
      const next = approvePendingChange(state);
      await saveRulesState(household.id, next);
      await logEvent({ householdId: household.id, type: "rules_approved", actor: "reviewer", message: `${household.reviewerName} approved the rule change. It applies now.` });
      return { state: next };
    }

    // Dropping: the requester withdraws it, or, where the reviewer owns the rules, the reviewer turns it down.
    // The reviewer can't cancel a change to rules the shopper owns: they can only speed it up.
    if (by === "reviewer" && state.owner === "shopper") {
      throw new FlowError(`${household.reviewerName} can't cancel ${household.shopperName}'s change, only approve it early.`, 403);
    }
    const next = dropPendingChange(state);
    await saveRulesState(household.id, next);
    const who = by === "shopper" ? household.shopperName : household.reviewerName;
    await logEvent({ householdId: household.id, type: "rules_change_dropped", actor: by, message: `${who} withdrew the waiting rule change.` });
    return { state: next };
  });
}
