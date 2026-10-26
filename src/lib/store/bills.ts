import { db } from "../db/client";

/** A bill for the shopper's time, sent to the customer as a PayPal invoice. */
export interface Bill {
  id: string;
  householdId: string;
  paypalInvoiceId: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  note: string;
  purchaseIds: string[];
  payerUrl: string | null;
  status: "unpaid" | "paid" | "canceled";
  createdAt: string;
  paidAt: string | null;
  checkedAt: string | null;
}

type Row = {
  id: string;
  household_id: string;
  paypal_invoice_id: string | null;
  invoice_number: string | null;
  amount_cents: number;
  note: string;
  purchase_ids: string[];
  payer_url: string | null;
  status: Bill["status"];
  created_at: string;
  paid_at: string | null;
  checked_at: string | null;
};

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
const toBill = (r: Row): Bill => ({
  id: r.id,
  householdId: r.household_id,
  paypalInvoiceId: r.paypal_invoice_id,
  invoiceNumber: r.invoice_number,
  amountCents: r.amount_cents,
  note: r.note,
  purchaseIds: r.purchase_ids ?? [],
  payerUrl: r.payer_url,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  paidAt: iso(r.paid_at),
  checkedAt: iso(r.checked_at),
});

export async function insertBill(b: { householdId: string; amountCents: number; note: string; purchaseIds: string[] }): Promise<Bill> {
  const [row] = (await db()`
    insert into bills (household_id, amount_cents, note, purchase_ids)
    values (${b.householdId}, ${b.amountCents}, ${b.note}, ${b.purchaseIds}::uuid[])
    returning *`) as Row[];
  return toBill(row);
}

/** PayPal created and sent the invoice. */
export async function setBillInvoice(id: string, inv: { paypalInvoiceId: string; invoiceNumber: string | null; payerUrl: string | null }): Promise<Bill> {
  const [row] = (await db()`
    update bills set paypal_invoice_id = ${inv.paypalInvoiceId}, invoice_number = ${inv.invoiceNumber}, payer_url = ${inv.payerUrl}, checked_at = now()
    where id = ${id} returning *`) as Row[];
  return toBill(row);
}

export async function getBill(householdId: string, id: string): Promise<Bill | null> {
  const [row] = (await db()`select * from bills where household_id = ${householdId} and id = ${id}`) as Row[];
  return row ? toBill(row) : null;
}

export async function listBills(householdId: string, limit = 20): Promise<Bill[]> {
  const rows = (await db()`select * from bills where household_id = ${householdId} order by created_at desc limit ${limit}`) as Row[];
  return rows.map(toBill);
}

/** Remove a bill PayPal never accepted, so it doesn't sit there as "unpaid". */
export async function deleteBill(id: string): Promise<void> {
  await db()`delete from bills where id = ${id} and paypal_invoice_id is null`;
}

/**
 * Move an unpaid bill to paid or canceled. Returns the bill only if this call
 * moved it, so the change is recorded exactly once however many pages ask.
 */
export async function settleBill(id: string, status: "paid" | "canceled"): Promise<Bill | null> {
  const [row] = (await db()`
    update bills set status = ${status}, paid_at = ${status === "paid" ? new Date().toISOString() : null}, checked_at = now()
    where id = ${id} and status = 'unpaid' returning *`) as Row[];
  return row ? toBill(row) : null;
}

/** Claim the next PayPal check for this bill; false if it was checked in the last `seconds`. */
export async function claimBillCheck(id: string, seconds: number): Promise<boolean> {
  const rows = await db()`
    update bills set checked_at = now()
    where id = ${id} and status = 'unpaid' and (checked_at is null or checked_at < now() - make_interval(secs => ${seconds}))
    returning id`;
  return rows.length > 0;
}
