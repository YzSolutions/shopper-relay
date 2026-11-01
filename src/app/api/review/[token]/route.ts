import type { NextRequest } from "next/server";
import { z } from "zod";
import { RELATIONSHIPS } from "@/config/relationships";
import { body, handle } from "@/lib/http";
import { findByReviewToken } from "@/lib/review";
import { expireIfOverdue, reviewerDecides } from "@/lib/purchases/service";
import { householdBudget } from "@/lib/store/budget";
import { purchaseView } from "@/lib/views";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/review/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { purchase, household } = await findByReviewToken(token);
    const current = await expireIfOverdue(household, purchase);
    const relationship = RELATIONSHIPS[household.relationship];
    return {
      household: { shopperName: household.shopperName, reviewerName: current.reviewerName ?? household.reviewerName },
      relationship: { id: relationship.id, title: relationship.title, flow: relationship.flow, otpa: relationship.otpa },
      purchase: purchaseView(current),
      // Left out: the purchase being decided, so the bars show what's left without it.
      budget: await householdBudget(household, current.id),
      paypal: { clientId: process.env.PAYPAL_CLIENT_ID ?? null },
    };
  });
}

/** Approve a held purchase, decline, or cancel a one-time authorization. (Paying is /pay then /paid.) */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/review/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { decision } = await body(req, z.object({ decision: z.enum(["approve", "decline", "cancel"]) }));
    const { purchase, household } = await findByReviewToken(token);
    return { purchase: purchaseView(await reviewerDecides(household, purchase, decision)) };
  });
}
