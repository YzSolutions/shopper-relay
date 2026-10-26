// Bills for the shopper's time (Personal shopper). The customer already paid for the
// items themselves with PayPal; this is the shopper's own fee, sent as a PayPal invoice
// that the customer pays on PayPal's invoice page. PayPal says when it's paid.

import { brand } from "@/config/brand";
import { RELATIONSHIPS } from "@/config/relationships";
import { formatCents } from "../money";
import { configFromEnv, createPayPalClient, type Invoice, type PayPalClient } from "../paypal/client";
import { FlowError } from "../purchases/service";
import { claimBillCheck, deleteBill, getBill, insertBill, listBills, setBillInvoice, settleBill, type Bill } from "../store/bills";
import { logEvent } from "../store/events";
import type { Household } from "../store/households";
import { listPurchases, type Purchase } from "../store/purchases";

let paypalClient: PayPalClient | null = null;
const paypal = () => (paypalClient ??= createPayPalClient(configFromEnv()));

export const BILL_MIN_CENTS = 1_00;
export const BILL_MAX_CENTS = 500_00;
/** Ask PayPal about an unpaid bill at most this often, however many screens are open. */
const CHECK_EVERY_SECONDS = 10;

const PAID: ReadonlySet<Invoice["status"]> = new Set(["PAID", "MARKED_AS_PAID"]);

function assertBills(household: Household) {
  if (!RELATIONSHIPS[household.relationship].bills) throw new FlowError("Bills for time are only for personal shoppers.", 400);
}

const covered = (bill: Bill, purchases: Purchase[]) =>
  bill.purchaseIds.flatMap((id) => {
    const p = purchases.find((x) => x.id === id);
    return p ? [{ id: p.id, title: p.item.title, cents: p.paypalCapturedCents ?? p.reviewedCents }] : [];
  });

/** What the screens show. */
export function billView(bill: Bill, purchases: Purchase[]) {
  return {
    id: bill.id,
    paypalInvoiceId: bill.paypalInvoiceId,
    invoiceNumber: bill.invoiceNumber,
    amountCents: bill.amountCents,
    note: bill.note,
    items: covered(bill, purchases),
    payerUrl: bill.status === "unpaid" ? bill.payerUrl : null,
    status: bill.status,
    createdAt: bill.createdAt,
    paidAt: bill.paidAt,
  };
}
export type BillView = ReturnType<typeof billView>;

/** Purchases the shopper can bill for: completed ones, newest first. */
export async function billablePurchases(household: Household): Promise<Purchase[]> {
  return (await listPurchases(household.id, 200)).filter((p) => p.state === "completed");
}

/** The shopper bills the customer for their time. PayPal creates the invoice; the customer pays it in PayPal. */
export async function sendBill(household: Household, input: { amountCents: number; note: string; purchaseIds: string[] }): Promise<BillView> {
  assertBills(household);
  const { shopperName: shopper, reviewerName: customer } = household;
  if (input.amountCents < BILL_MIN_CENTS || input.amountCents > BILL_MAX_CENTS) {
    throw new FlowError(`A bill can be from ${formatCents(BILL_MIN_CENTS)} to ${formatCents(BILL_MAX_CENTS)}.`, 400);
  }
  const note = input.note.trim();
  if (!note) throw new FlowError(`Say what the bill is for, so ${customer} knows.`, 400);
  const done = await billablePurchases(household);
  const ids = [...new Set(input.purchaseIds)];
  const items = ids.map((id) => done.find((p) => p.id === id));
  if (items.some((p) => !p)) throw new FlowError("A bill can only list purchases that are complete.", 400);

  const bill = await insertBill({ householdId: household.id, amountCents: input.amountCents, note, purchaseIds: ids });
  const lines = (items as Purchase[]).map((p) => `• ${p.item.title} (${formatCents(p.paypalCapturedCents ?? p.reviewedCents)})`);
  const invoiceNote = [
    note,
    lines.length ? `\nThis covers ${shopper}'s time for:\n${lines.join("\n")}` : "",
    `\nThe items themselves were already paid for with PayPal. This bill is only for ${shopper}'s time.`,
  ].join("\n");

  let sent: Bill;
  try {
    const invoice = await paypal().createInvoice({
      amountCents: input.amountCents,
      itemName: "Personal shopping fee",
      note: invoiceNote,
      invoicerName: `${shopper}, via ${brand.name}`,
      requestId: `bill-${bill.id}`,
    });
    const link = await paypal().sendInvoice(invoice.id, `bill-send-${bill.id}`);
    sent = await setBillInvoice(bill.id, {
      paypalInvoiceId: invoice.id,
      invoiceNumber: invoice.detail?.invoice_number ?? null,
      payerUrl: link?.href ?? invoice.detail?.metadata?.recipient_view_url ?? null,
    });
  } catch (err) {
    await deleteBill(bill.id); // PayPal has no invoice, so neither do we
    throw err;
  }
  await logEvent({
    householdId: household.id,
    type: "bill_sent",
    actor: "shopper",
    message: `${shopper} sent ${customer} a bill for ${formatCents(input.amountCents)} for ${shopper}'s time: "${note}". It's a PayPal invoice${sent.invoiceNumber ? ` (number ${sent.invoiceNumber})` : ""}; the items were paid for separately.`,
    detail: { billId: sent.id, invoiceId: sent.paypalInvoiceId, amountCents: input.amountCents, purchaseIds: ids },
  });
  return billView(sent, done);
}

/** Ask PayPal whether an unpaid bill was paid or canceled there, and record it once. */
async function refresh(household: Household, bill: Bill, force = false): Promise<Bill> {
  if (bill.status !== "unpaid" || !bill.paypalInvoiceId) return bill;
  if (!force && !(await claimBillCheck(bill.id, CHECK_EVERY_SECONDS))) return bill;
  const invoice = await paypal().getInvoice(bill.paypalInvoiceId);
  const status = PAID.has(invoice.status) ? "paid" : invoice.status === "CANCELLED" ? "canceled" : null;
  if (!status) return bill;
  const moved = await settleBill(bill.id, status);
  if (!moved) return (await getBill(household.id, bill.id)) ?? bill;
  const { shopperName: shopper, reviewerName: customer } = household;
  await logEvent({
    householdId: household.id,
    type: status === "paid" ? "bill_paid" : "bill_canceled",
    actor: "paypal",
    message:
      status === "paid"
        ? `PayPal: ${customer} paid ${shopper}'s bill for ${formatCents(bill.amountCents)}.`
        : `PayPal: the bill for ${formatCents(bill.amountCents)} was canceled.`,
    detail: { billId: bill.id, invoiceId: bill.paypalInvoiceId, paypalStatus: invoice.status },
  });
  return moved;
}

/** Every bill, newest first, with unpaid ones checked with PayPal. */
export async function billsFor(household: Household): Promise<BillView[]> {
  if (!RELATIONSHIPS[household.relationship].bills) return [];
  const [bills, done] = await Promise.all([listBills(household.id), billablePurchases(household)]);
  const fresh = await Promise.all(bills.map((b) => refresh(household, b).catch(() => b))); // PayPal down: show what we know
  return fresh.map((b) => billView(b, done));
}

/** The shopper withdraws an unpaid bill. */
export async function cancelBill(household: Household, id: string): Promise<BillView> {
  assertBills(household);
  const bill = await getBill(household.id, id);
  if (!bill) throw new FlowError("That bill wasn't found.", 404);
  const now = await refresh(household, bill, true);
  if (now.status === "paid") throw new FlowError(`${household.reviewerName} already paid this bill, so it can't be withdrawn.`, 409);
  if (now.status === "unpaid") {
    if (now.paypalInvoiceId) await paypal().cancelInvoice(now.paypalInvoiceId);
    const moved = await settleBill(now.id, "canceled");
    if (moved) {
      await logEvent({
        householdId: household.id,
        type: "bill_canceled",
        actor: "shopper",
        message: `${household.shopperName} withdrew the bill for ${formatCents(bill.amountCents)}.`,
        detail: { billId: bill.id, invoiceId: bill.paypalInvoiceId },
      });
    }
  }
  return billView((await getBill(household.id, id)) ?? now, await billablePurchases(household));
}
