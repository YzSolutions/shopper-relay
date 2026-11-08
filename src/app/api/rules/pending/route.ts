import { z } from "zod";
import { body, handle } from "@/lib/http";
import { FlowError } from "@/lib/purchases/service";
import { approvePendingChange, delayPendingChange, dropPendingChange } from "@/lib/policy";
import { saveRulesState } from "@/lib/store/households";
import { currentRulesState, logRuleEvent } from "@/lib/store/ruleHistory";
import { assertSameHousehold, currentHousehold } from "@/lib/store/current";

/** The reviewer approves or delays a waiting rule change, or it's withdrawn or turned down. */
export async function POST(req: Request) {
  return handle(async () => {
    const { action, by, householdId } = await body(req, z.object({ action: z.enum(["approve", "delay", "drop"]), by: z.enum(["shopper", "reviewer"]), householdId: z.uuid().optional() }));
    const household = await currentHousehold();
    assertSameHousehold(household.id, householdId);
    const state = await currentRulesState(household);
    if (!state.pending) throw new FlowError("There's no rule change waiting.", 409);
    const change = { before: state.rules, after: state.pending.proposed };

    if (action === "approve") {
      if (by !== "reviewer") throw new FlowError(`Only ${household.reviewerName} can approve a waiting change early.`, 403);
      const next = approvePendingChange(state);
      await saveRulesState(household.id, next);
      await logRuleEvent(household.id, {
        type: "rules_approved",
        actor: "reviewer",
        message: `${household.reviewerName} approved the rule change. It applies now.`,
        change: { ...change, status: "applied" },
      });
      return { state: next };
    }

    if (action === "delay") {
      if (by !== "reviewer") throw new FlowError(`Only ${household.reviewerName} can delay a waiting change.`, 403);
      const next = delayPendingChange(state);
      if (!next) throw new FlowError("This change has already been delayed, or isn't starting on its own.", 409);
      await saveRulesState(household.id, next);
      await logRuleEvent(household.id, {
        type: "rules_delayed",
        actor: "reviewer",
        message: `${household.reviewerName} delayed the rule change 3 days, to talk with ${household.shopperName} about it.`,
        change: { ...change, status: "waiting" },
      });
      return { state: next };
    }

    // Dropping: the requester withdraws it, or, where the reviewer owns the rules, the reviewer turns it down.
    // The reviewer can't cancel a change to rules the shopper owns: they can only speed it up or delay it.
    if (by === "reviewer" && state.owner === "shopper") {
      throw new FlowError(`${household.reviewerName} can't cancel ${household.shopperName}'s change, only approve it early.`, 403);
    }
    const next = dropPendingChange(state);
    await saveRulesState(household.id, next);
    const asker = state.pending.requestedBy === "shopper" ? household.shopperName : household.reviewerName;
    const message =
      by === state.pending.requestedBy ? `${asker} withdrew the waiting rule change.` : `${household.reviewerName} said no to ${asker}'s rule change.`;
    await logRuleEvent(household.id, { type: "rules_change_dropped", actor: by, message, change: { ...change, status: "dropped" } });
    return { state: next };
  });
}
