import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { sendRequest } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { purchaseView } from "@/lib/views";

/** The shopper asks the reviewer to approve and pay (kids, personal shopper). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/request">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { purchase: purchaseView(await sendRequest(await currentHousehold(), id), { includeReviewLink: true }) };
  });
}
