"use client";

import { useCallback, useEffect, useState } from "react";
import { BillLine } from "@/components/Bills";
import { Button, ErrorNotice, Money, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, type BillsData } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";
import { formatCents, parseToCents } from "@/lib/money";

// The personal shopper bills the customer for their time. The customer already paid for
// the items themselves; this is only the shopper's fee, sent as a PayPal invoice.

export default function BillsPage() {
  const { session, error: loadError } = useSession();
  const [data, setData] = useState<BillsData | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Shopping this week");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<BillsData>("/api/bills"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, then refresh to see when it's paid
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!session) return loadError ? <ErrorNotice error={loadError} /> : <Spinner label="Loading…" />;
  const customer = session.household.reviewerName;
  if (!session.relationship.bills) {
    return (
      <div className="max-w-3xl">
        <PageTitle>Bills</PageTitle>
        <p className="text-lg text-ink-soft">Bills are for the Personal shopper setup, where the shopper charges the customer for their time.</p>
      </div>
    );
  }

  let cents: number | null = null;
  try {
    cents = amount.trim() ? parseToCents(amount.replace(/^\$/, "")) : null;
  } catch {
    cents = null;
  }
  const amountOk = cents !== null && cents >= 100 && cents <= 50000;

  async function send() {
    if (!amountOk) return;
    setBusy("send");
    setError(null);
    setSent(null);
    try {
      await api("/api/bills", { method: "POST", json: { action: "send", amountCents: cents, note, purchaseIds: picked } });
      setSent(`Sent. ${customer} sees the bill and pays it with PayPal.`);
      setAmount("");
      setPicked([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api("/api/bills", { method: "POST", json: { action: "cancel", id } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="max-w-3xl space-y-10">
      <PageTitle lead={`Bill ${customer} for your time. ${customer} already pays for the items themselves, so a bill is only your fee. PayPal sends it as an invoice, and ${customer} pays it with PayPal.`}>
        Bills
      </PageTitle>

      <section aria-labelledby="new-bill" className="space-y-5 rounded-2xl border-2 border-line p-6">
        <h2 id="new-bill" className="text-2xl font-bold">
          New bill for {customer}
        </h2>
        <label className="block">
          <span className="font-semibold">Your fee</span>
          <span className="mt-2 flex max-w-48 items-center rounded-xl border-2 border-line px-4 focus-within:border-relay">
            <span aria-hidden className="text-lg text-ink-soft">
              $
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              className="min-h-13 w-full px-2 text-lg outline-none"
              aria-describedby="fee-help"
            />
          </span>
          <span id="fee-help" className="mt-1 block text-base text-ink-soft">
            From $1 to $500.
          </span>
        </label>
        <label className="block">
          <span className="font-semibold">What it&apos;s for</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            className="mt-2 min-h-13 w-full rounded-xl border-2 border-line px-4 text-lg outline-none focus:border-relay"
          />
        </label>

        <fieldset>
          <legend className="font-semibold">Which purchases it covers (optional)</legend>
          {!data && <Spinner label="Loading purchases…" />}
          {data?.billable.length === 0 && <p className="mt-2 text-ink-soft">No finished purchases yet. You can still send a bill.</p>}
          <div className="mt-2 space-y-2">
            {data?.billable.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-mist px-4 py-3">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1.5 size-5 shrink-0 accent-relay" />
                <span>
                  {p.title} <span className="text-ink-soft">(<Money cents={p.cents} />, already paid)</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <ErrorNotice error={error} />
        {sent && <Notice tone="ledger">{sent}</Notice>}
        <Button onClick={send} disabled={!amountOk || !note.trim() || busy !== null}>
          {busy === "send" ? "Sending…" : amountOk ? `Send ${customer} a bill for ${formatCents(cents!)}` : `Send ${customer} a bill`}
        </Button>
      </section>

      <section aria-labelledby="sent-bills" className="space-y-4">
        <h2 id="sent-bills" className="text-2xl font-bold">
          Bills you sent
        </h2>
        {data?.bills.length === 0 && <p className="text-lg text-ink-soft">None yet.</p>}
        {data?.bills.map((b) => (
          <BillLine key={b.id} bill={b} who={customer} side="shopper">
            {b.status === "unpaid" && (
              <Button tone="quiet" onClick={() => withdraw(b.id)} disabled={busy !== null}>
                {busy === b.id ? "Withdrawing…" : "Withdraw it"}
              </Button>
            )}
          </BillLine>
        ))}
      </section>
    </div>
  );
}
