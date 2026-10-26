import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { buyWithStanding } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

/** The shopper buys within the payer's rules, paid with the payer's saved PayPal (standing permission). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/standing">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { purchase: purchaseView(await buyWithStanding(await currentHousehold(), id)) };
  });
}
