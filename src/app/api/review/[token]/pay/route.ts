import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, handle } from "@/lib/http";
import { numberToCents } from "@/lib/money";
import { findByReviewToken } from "@/lib/review";
import { reviewerStartPayment } from "@/lib/purchases/service";
import { OTPA_MAX_DAYS } from "@/lib/purchases/lifecycle";

const Pay = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pay") }),
  z.object({
    kind: z.literal("otpa"),
    // At least a cent, in whole cents: a fraction of a cent would round to a $0.00 hold.
    maxDollars: z.number().min(0.01).max(10_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use dollars and cents, like 275 or 275.50."),
    details: z.string().max(160).default(""),
    expiresInDays: z.number().int().min(1).max(OTPA_MAX_DAYS),
  }),
]);

/** Called by the reviewer's PayPal button: create the order to approve (this purchase, or a hold up to their price). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/review/[token]/pay">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const pay = await body(req, Pay);
    const { purchase, household } = await findByReviewToken(token);
    return pay.kind === "pay"
      ? reviewerStartPayment(household, purchase, "pay")
      : reviewerStartPayment(household, purchase, "otpa", { maxCents: numberToCents(pay.maxDollars), details: pay.details, expiresInDays: pay.expiresInDays });
  });
}
