"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { RulesTable } from "@/components/RulesTable";
import { Button, ErrorNotice, Money, Notice, Spinner } from "@/components/ui";
import { api, type PurchaseView } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

// The reviewers' inbox, standing in for the text messages a real app would
// send. Demo only: it isn't signed in, so it wouldn't exist in production.

const OPEN = new Set(["awaiting_review", "requested", "hunting"]);

export default function ReviewerInbox() {
  const { session, reload } = useSession();
  const [items, setItems] = useState<PurchaseView[] | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { purchases } = await api<{ purchases: PurchaseView[] }>("/api/purchases");
      setItems(purchases.filter((p) => OPEN.has(p.state) && p.reviewPath));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, then refresh every few seconds
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function answerChange(action: "approve" | "drop") {
    setBusy(true);
    setError(null);
    try {
      await api("/api/rules/pending", { method: "POST", json: { action, by: "reviewer" } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <PhoneShell title="inbox">{<Spinner label="Loading…" />}</PhoneShell>;
  const shopper = session.household.shopperName;
  const main = session.household.reviewerName;
  const reviewer = who && session.reviewers.includes(who) ? who : main;
  const mine = items?.filter((p) => (p.reviewerName ?? main) === reviewer) ?? null;
  const pending = reviewer === main ? session.pending : null;
  const shopperOwns = session.owner === "shopper";
  const empty = mine !== null && mine.length === 0 && !pending;

  return (
    <PhoneShell title={`for ${reviewer}`}>
      <div className="space-y-6">
        {session.reviewers.length > 1 && (
          <div className="flex gap-2" role="tablist" aria-label="Whose inbox">
            {session.reviewers.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={r === reviewer}
                onClick={() => setWho(r)}
                className={`rounded-full px-4 py-1.5 font-semibold ${r === reviewer ? "bg-relay text-white" : "border-2 border-line"}`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <h1 className="text-[1.75rem] font-extrabold">Hi {reviewer}</h1>
        <ErrorNotice error={error} />
        {mine === null && <Spinner label="Checking for requests…" />}
        {empty && <p className="text-lg text-ink-soft">Nothing needs you right now.</p>}

        {mine?.map((p) => (
          <Link key={p.id} href={p.reviewPath!} className="block rounded-2xl border-2 border-signal bg-signal-wash p-5 hover:border-signal-text">
            <p className="font-semibold text-signal-text">
              {p.state === "hunting" ? `${shopper} is looking for it at your price` : p.flow === "request" ? `${shopper} is asking` : `${shopper} would like your OK`}
            </p>
            <p className="mt-1 text-xl font-bold">{p.item.title}</p>
            <p className="mt-1 text-2xl font-extrabold">
              <Money cents={p.state === "hunting" && p.otpa ? p.otpa.maxCents : (p.paypalAmountCents ?? p.reviewedCents)} />
              {p.state === "hunting" && <span className="text-lg font-semibold text-ink-soft"> at most</span>}
            </p>
            {p.decision.outcome === "exception" && p.state !== "hunting" && <p className="mt-1 font-semibold text-signal-text">Over budget</p>}
            <p className="mt-2 font-semibold text-relay underline underline-offset-4">{p.state === "hunting" ? "See or cancel it" : "Review it"}</p>
          </Link>
        ))}

        {pending && (
          <div className="space-y-4 rounded-2xl border-2 border-line p-5">
            <p className="text-xl font-bold">{shopperOwns ? `${shopper} loosened a safeguard` : `${shopper} asked to change a rule`}</p>
            <p>
              {pending.autoActivateAt
                ? `It starts on its own ${new Date(pending.autoActivateAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}. You can let it start now. You can't block it: these are ${shopper}'s rules.`
                : `It waits for your answer.`}
            </p>
            <RulesTable rules={pending.proposed} reviewer={main} flow={session.relationship.flow} caption="The rules after this change" />
            <div className="grid gap-3">
              <Button tone="ledger" onClick={() => answerChange("approve")} disabled={busy}>
                {shopperOwns ? "Let it start now" : "Approve the change"}
              </Button>
              {!shopperOwns && (
                <Button tone="stop" onClick={() => answerChange("drop")} disabled={busy}>
                  Say no
                </Button>
              )}
            </div>
          </div>
        )}

        <Notice tone="relay">In a real app these arrive as text messages. This page stands in for {reviewer}&apos;s phone in the demo.</Notice>
      </div>
    </PhoneShell>
  );
}
