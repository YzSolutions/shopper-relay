import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, handle } from "@/lib/http";
import { buyWithOtpa, otpaOptions } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

/** Listings the shopper could buy under the one-time authorization, each marked allowed or not, with why. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/otpa">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { options: await otpaOptions(await currentHousehold(), id) };
  });
}

/** The shopper buys a listing under the authorization. The server checks it, then PayPal takes exactly that price. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/otpa">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { sourceId, merchant } = await body(req, z.object({ sourceId: z.string().min(1).max(64), merchant: z.string().min(1).max(100) }));
    const purchase = await buyWithOtpa(await currentHousehold(), id, sourceId, merchant);
    return { purchase: purchaseView(purchase) };
  });
}
