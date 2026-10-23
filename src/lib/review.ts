import { FlowError } from "./purchases/service";
import { getHousehold, type Household } from "./store/households";
import { getPurchaseByReviewToken, type Purchase } from "./store/purchases";

// The reviewer's private link. The token is the only credential, so it is
// long and random, and it stops working once the purchase is settled.

export async function findByReviewToken(token: string): Promise<{ purchase: Purchase; household: Household }> {
  if (token.length < 20) throw new FlowError("This review link isn't valid.", 404);
  const purchase = await getPurchaseByReviewToken(token);
  if (!purchase) throw new FlowError("This review link has already been used or has expired.", 404);
  const household = await getHousehold(purchase.householdId);
  if (!household) throw new FlowError("This review link isn't valid.", 404);
  return { purchase, household };
}
