import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { startCheckout } from "@/lib/purchases/service";
import { demoHousehold } from "@/lib/store/households";

/** Called by the PayPal button's createOrder: returns the PayPal order id to approve. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/checkout">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return startCheckout(await demoHousehold(), id);
  });
}
