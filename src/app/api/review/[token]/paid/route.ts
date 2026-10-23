import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, handle } from "@/lib/http";
import { findByReviewToken } from "@/lib/review";
import { reviewerCompletePayment } from "@/lib/purchases/service";
import { purchaseView } from "@/lib/views";

/** Called by the reviewer's PayPal button after approval: pay now, or activate the one-time authorization. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/review/[token]/paid">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { orderId } = await body(req, z.object({ orderId: z.string().min(1).max(64) }));
    const { purchase, household } = await findByReviewToken(token);
    return { purchase: purchaseView(await reviewerCompletePayment(household, purchase, orderId)) };
  });
}
