import { handle } from "@/lib/http";
import { accountHolder, boughtFor, statement } from "@/lib/purchases/account";
import { expireOverdue } from "@/lib/purchases/service";
import { currentHousehold, currentVisitor } from "@/lib/store/current";
import { visitorHouseholds } from "@/lib/store/households";
import { listPurchasesIn } from "@/lib/store/purchases";
import { purchaseView } from "@/lib/views";

/**
 * The History table: everything charged to (or asked of) the PayPal account this tab pays from,
 * from every relationship this visitor has opened. Only their own households are read.
 */
export async function GET() {
  return handle(async () => {
    const here = await currentHousehold();
    const households = await visitorHouseholds(await currentVisitor());
    await Promise.all(households.map(expireOverdue));
    const byId = new Map(households.map((h) => [h.id, h]));
    const entries = (await listPurchasesIn(households.map((h) => h.id))).map((purchase) => ({ purchase, household: byId.get(purchase.householdId)! }));
    const holder = accountHolder(here);
    return {
      holder,
      purchases: statement(entries, holder).map(({ purchase, household }) => ({
        ...purchaseView(purchase),
        people: { shopper: household.shopperName, reviewer: household.reviewerName, for: boughtFor(household) },
        // Rows from another tab can't open here (each tab's pages show its own relationship).
        here: household.id === here.id,
      })),
    };
  });
}
