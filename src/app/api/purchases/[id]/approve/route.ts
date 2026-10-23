import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, handle } from "@/lib/http";
import { completeApproval } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

/** Called by the PayPal button's onApprove: place the hold and decide what happens next. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/approve">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { orderId } = await body(req, z.object({ orderId: z.string().min(1).max(64) }));
    const purchase = await completeApproval(await currentHousehold(), id, orderId);
    return { purchase: purchaseView(purchase, { includeReviewLink: true }) };
  });
}
