import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { findBetter } from "@/lib/purchases/better";
import { findByReviewToken } from "@/lib/review";

/** A similar product within the shopper's own rules, for the reviewer to send instead. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/review/[token]/better">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const { purchase, household } = await findByReviewToken(token);
    return { option: await findBetter(household, purchase) };
  });
}
