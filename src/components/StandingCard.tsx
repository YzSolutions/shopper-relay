"use client";

import { useState } from "react";
import { PayPalSaveButton } from "@/components/PayPalButton";
import { Button, ErrorNotice, Money } from "@/components/ui";
import { api, type PurchaseView, type Session } from "@/lib/client/api";
import { ruleRows } from "@/lib/client/describe";

// On the payer's phone: save PayPal once so the shopper can buy what the payer's rules
// allow without asking, see what was bought that way, or turn it off.

export function StandingCard({ session, purchases, onChange }: { session: Session; purchases: PurchaseView[] | null; onChange: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const shopper = session.household.shopperName;
  const standing = session.standing;
  const clientId = session.paypal.clientId;
  const bought = (purchases ?? []).filter((p) => p.standing && p.state === "completed").slice(0, 3);
  // What standing permission would actually let the shopper buy: the rules' "buys on their own" rows.
  const own = ruleRows(session.active).flatMap((r) => r.bands.filter((b) => b.outcome === "auto").map((b) => `${r.label}: ${b.range.toLowerCase()}`));
  const example = { parent_child: "books under $20", ai_shopper: "DDR5 RAM under $300" }[session.household.relationship as string] ?? "shoes under $80";
  const whatItCovers = own.length ? (
    <p>
      Your rules let {shopper} buy these without asking: {own.join("; ")}.
    </p>
  ) : (
    <p className="rounded-xl bg-signal-wash px-4 py-3">
      Right now your rules don&apos;t let {shopper} buy anything without asking, so this changes nothing yet. Add a rule on the Rules page first, for
      example &ldquo;{shopper} can buy {example} without asking&rdquo;.
    </p>
  );

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/standing", { method: "POST", json: { action: "revoke" } });
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Off, it's an optional extra, so it stays folded away and requests come first.
  if (!standing && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-relay underline underline-offset-4">
        Let {shopper} buy without asking
      </button>
    );
  }

  return (
    <section aria-labelledby="standing" className="space-y-4 rounded-2xl border-2 border-line p-5">
      <h2 id="standing" className="text-xl font-bold">
        {standing ? "Standing permission is on" : `Let ${shopper} buy without asking`}
      </h2>
      {standing ? (
        <>
          <p>
            {shopper} can buy what your rules allow, paid with your saved PayPal{standing.payerLabel && <> ({standing.payerLabel})</>}. Everything else still
            comes to you. On since {new Date(standing.since).toLocaleDateString([], { month: "short", day: "numeric" })}.
          </p>
          {whatItCovers}
          {bought.length > 0 && (
            <ul className="space-y-2">
              {bought.map((p) => (
                <li key={p.id} className="rounded-2xl bg-mist px-4 py-3">
                  {shopper} bought {p.item.title} for <Money cents={p.paypalCapturedCents ?? p.reviewedCents} />.
                </li>
              ))}
            </ul>
          )}
          <Button tone="stop" onClick={turnOff} disabled={busy} className="w-full">
            {busy ? "Turning off…" : "Turn it off"}
          </Button>
        </>
      ) : (
        <>
          <p>
            Save your PayPal once. Then {shopper} can buy what your rules allow without asking each time, and you get a message after each purchase. Anything
            else still comes to you. You can turn it off at any time.
          </p>
          {whatItCovers}
          {clientId ? (
            <PayPalSaveButton
              clientId={clientId}
              createSetupToken={async () => (await api<{ setupTokenId: string }>("/api/standing", { method: "POST", json: { action: "setup" } })).setupTokenId}
              onApprove={async (setupTokenId) => {
                await api("/api/standing", { method: "POST", json: { action: "confirm", setupTokenId } });
                await onChange();
              }}
              onError={setError}
            />
          ) : (
            <p className="text-ink-soft">PayPal isn&apos;t set up on this server.</p>
          )}
        </>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}
