import { z } from "zod";
import { BILL_MAX_CENTS, BILL_MIN_CENTS, billablePurchases, billsFor, cancelBill, sendBill } from "@/lib/bills/service";
import { body, handle } from "@/lib/http";
import { currentHousehold } from "@/lib/store/current";

// Bills for the shopper's time (Personal shopper), sent as PayPal invoices. GET also
// lists the completed purchases a bill can cover.

export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    const [bills, done] = await Promise.all([billsFor(household), billablePurchases(household)]);
    return {
      bills,
      billable: done.slice(0, 20).map((p) => ({ id: p.id, title: p.item.title, cents: p.paypalCapturedCents ?? p.reviewedCents, at: p.updatedAt })),
    };
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    amountCents: z.number().int().min(BILL_MIN_CENTS).max(BILL_MAX_CENTS),
    note: z.string().min(1).max(300),
    purchaseIds: z.array(z.uuid()).max(20),
  }),
  z.object({ action: z.literal("cancel"), id: z.uuid() }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    const household = await currentHousehold();
    if (a.action === "send") return Response.json({ bill: await sendBill(household, a) }, { status: 201 });
    return { bill: await cancelBill(household, a.id) };
  });
}
