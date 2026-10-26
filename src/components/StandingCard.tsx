"use client";

import { useState } from "react";
import { PayPalSaveButton } from "@/components/PayPalButton";
import { Button, ErrorNotice, Money } from "@/components/ui";
import { api, type PurchaseView, type Session } from "@/lib/client/api";

// On the payer's phone: save PayPal once so the shopper can buy what the payer's rules
// allow without asking, see what was bought that way, or turn it off.

export function StandingCard({ session, purchases, onChange }: { session: Session; purchases: PurchaseView[] | null; onChange: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shopper = session.household.shopperName;
  const standing = session.standing;
  const clientId = session.paypal.clientId;
  const bought = (purchases ?? []).filter((p) => p.standing && p.state === "completed").slice(0, 3);

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
