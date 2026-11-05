import { z } from "zod";
import { body, handle } from "@/lib/http";
import { runGoal } from "@/lib/purchases/goalAgent";
import { FlowError } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

// A few Gemini turns and catalog searches, then PayPal's capture.
export const maxDuration = 60;

/** Give the AI Shopper a job in plain words. */
export async function POST(req: Request) {
  return handle(async () => {
    const { goal } = await body(req, z.object({ goal: z.string().trim().min(2).max(200) }));
    const household = await currentHousehold();
    if (household.relationship !== "ai_shopper") throw new FlowError("Only the AI Shopper setup takes a job like this.", 409);
    const { steps, purchase } = await runGoal(household, goal);
    return { steps, purchase: purchase && purchaseView(purchase) };
  });
}
