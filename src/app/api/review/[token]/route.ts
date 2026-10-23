import type { NextRequest } from "next/server";
import { z } from "zod";
import { RELATIONSHIPS } from "@/config/relationships";
import { body, handle } from "@/lib/http";
import { expireIfOverdue, FlowError, reviewerDecides } from "@/lib/purchases/service";
import { getHousehold } from "@/lib/store/households";
import { getPurchaseByReviewToken, type Purchase } from "@/lib/store/purchases";
import { purchaseView } from "@/lib/views";

// The reviewer's private link. The token is the only credential, so it is
// long and random, and it stops working once the purchase is decided.

async function find(token: string): Promise<{ purchase: Purchase; household: NonNullable<Awaited<ReturnType<typeof getHousehold>>> }> {
  if (token.length < 20) throw new FlowError("This review link isn't valid.", 404);
  const purchase = await getPurchaseByReviewToken(token);
  if (!purchase) throw new FlowError("This review link has already been used or has expired.", 404);
  const household = await getHousehold(purchase.householdId);
  if (!household) throw new FlowError("This review link isn't valid.", 404);
  return { purchase, household };
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/review/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { purchase, household } = await find(token);
    const current = await expireIfOverdue(household, purchase);
    return {
      household: { shopperName: household.shopperName, reviewerName: household.reviewerName },
      relationship: RELATIONSHIPS[household.relationship].title,
      purchase: purchaseView(current),
    };
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/review/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { decision } = await body(req, z.object({ decision: z.enum(["approve", "decline"]) }));
    const { purchase, household } = await find(token);
    return { purchase: purchaseView(await reviewerDecides(household, purchase, decision)) };
  });
}
