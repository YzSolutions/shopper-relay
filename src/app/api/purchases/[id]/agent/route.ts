import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { runAgent } from "@/lib/purchases/agent";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

// A few Gemini turns and catalog searches, then PayPal's capture.
export const maxDuration = 60;

/** Send the AI shopper to find and buy the product under the one-time authorization. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/agent">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { steps, purchase } = await runAgent(await currentHousehold(), id);
    return { steps, purchase: purchaseView(purchase) };
  });
}
