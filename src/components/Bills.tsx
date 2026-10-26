"use client";

import type { ReactNode } from "react";
import { ButtonAnchor, Money } from "@/components/ui";
import type { BillView } from "@/lib/client/api";

// Bills for the shopper's time (Personal shopper): one line per bill for either side,
// and the card on the customer's phone with PayPal's pay link.

const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

function statusWords(bill: BillView, side: "shopper" | "customer", who: string): { text: string; tone: string } {
  if (bill.status === "paid") return { text: side === "shopper" ? `${who} paid it${bill.paidAt ? ` on ${day(bill.paidAt)}` : ""}` : `You paid it${bill.paidAt ? ` on ${day(bill.paidAt)}` : ""}`, tone: "text-ledger" };
  if (bill.status === "canceled") return { text: "Withdrawn", tone: "text-ink-soft" };
  return { text: side === "shopper" ? `Waiting for ${who} to pay` : "Not paid yet", tone: "text-signal-text" };
}

/** One bill. `who` is the other person: the customer on the shopper's screen, the shopper on the customer's. */
export function BillLine({ bill, who, side, children }: { bill: BillView; who: string; side: "shopper" | "customer"; children?: ReactNode }) {
  const status = statusWords(bill, side, who);
  return (
    <article className="space-y-2 rounded-2xl border-2 border-line p-5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-2xl font-extrabold">
          <Money cents={bill.amountCents} />
        </span>
        <span className={`font-semibold ${status.tone}`}>{status.text}</span>
      </p>
      <p className="text-lg">{bill.note}</p>
      {bill.items.length > 0 && (
        <p className="text-ink-soft">
          For {bill.items.length === 1 ? "finding" : `finding ${bill.items.length} things:`} {bill.items.map((i) => i.title).join("; ")}.
        </p>
      )}
      <p className="text-base text-ink-soft">
        PayPal invoice{bill.invoiceNumber && ` ${bill.invoiceNumber}`}, sent {day(bill.createdAt)}.
      </p>
      {children}
    </article>
  );
}

/** On the customer's phone: bills to pay, and the last few paid. */
export function BillsCard({ bills, shopper }: { bills: BillView[] | null; shopper: string }) {
  if (!bills?.length) return null;
  const open = bills.filter((b) => b.status === "unpaid");
  const paid = bills.filter((b) => b.status === "paid").slice(0, 3);
  if (!open.length && !paid.length) return null;
  return (
    <section aria-labelledby="bills" className="space-y-4">
      <h2 id="bills" className="text-xl font-bold">
        {open.length ? `${shopper} sent you ${open.length === 1 ? "a bill" : `${open.length} bills`}` : `Bills from ${shopper}`}
      </h2>
      {open.map((b) => (
        <BillLine key={b.id} bill={b} who={shopper} side="customer">
          <p>This is {shopper}&apos;s fee for their time. The items themselves were already paid for.</p>
          {b.payerUrl && (
            <ButtonAnchor href={b.payerUrl} className="w-full">
              Pay with PayPal
            </ButtonAnchor>
          )}
          <p className="text-base text-ink-soft">Opens PayPal&apos;s invoice page. This page updates once PayPal says it&apos;s paid.</p>
        </BillLine>
      ))}
      {paid.map((b) => (
        <p key={b.id} className="rounded-2xl bg-mist px-4 py-3">
          You paid {shopper}&apos;s bill for <Money cents={b.amountCents} />
          {b.paidAt && ` on ${day(b.paidAt)}`}.
        </p>
      ))}
    </section>
  );
}
