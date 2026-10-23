import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { expireIfOverdue, loadPurchase } from "@/lib/purchases/service";
import { purchaseLog } from "@/lib/store/events";
import { demoHousehold } from "@/lib/store/households";
import { purchaseView } from "@/lib/views";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const household = await demoHousehold();
    const purchase = await expireIfOverdue(household, await loadPurchase(household, id));
    return { purchase: purchaseView(purchase, { includeReviewLink: true }), log: await purchaseLog(purchase.id) };
  });
}
