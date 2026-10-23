import { z } from "zod";
import { body, handle } from "@/lib/http";
import { chooseCatalogItem, chooseCheckedItem, expireOverdue } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { listPurchases } from "@/lib/store/purchases";
import { purchaseView } from "@/lib/views";

const Choose = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("catalog"), sourceId: z.string().min(1).max(64), merchant: z.string().max(100).optional() }),
  z.object({ kind: z.literal("checked"), checkId: z.uuid() }),
]);

export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    await expireOverdue(household);
    return { purchases: (await listPurchases(household.id)).map((p) => purchaseView(p, { includeReviewLink: true })) };
  });
}

/** The shopper picks something. The rules are checked now and again once PayPal holds the money. */
export async function POST(req: Request) {
  return handle(async () => {
    const choice = await body(req, Choose);
    const household = await currentHousehold();
    const purchase =
      choice.kind === "catalog"
        ? await chooseCatalogItem(household, choice.sourceId, choice.merchant)
        : await chooseCheckedItem(household, choice.checkId);
    return Response.json({ purchase: purchaseView(purchase) }, { status: 201 });
  });
}
