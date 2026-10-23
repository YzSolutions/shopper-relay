import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { cancelPurchase } from "@/lib/purchases/service";
import { demoHousehold } from "@/lib/store/households";
import { purchaseView } from "@/lib/views";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/cancel">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { purchase: purchaseView(await cancelPurchase(await demoHousehold(), id)) };
  });
}
