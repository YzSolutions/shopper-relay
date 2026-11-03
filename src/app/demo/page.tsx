"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

// Split screen for the video and for judges: the shopper's app on the left,
// the reviewer's phone on the right, and demo-only controls above.

function clearSavedSearch() {
  try {
    sessionStorage.clear();
  } catch {
    // storage unavailable
  }
}

export default function DemoPage() {
  const left = useRef<HTMLIFrameElement>(null);
  const phone = useRef<HTMLIFrameElement>(null);
  const { session, reload } = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hidden = session?.household.hideBrands ?? false;

  async function run(label: string, json: unknown) {
    setBusy(true);
    setStatus(null);
    try {
      await api("/api/demo", { method: "POST", json });
      await reload();
      setStatus(label);
      left.current?.contentWindow?.location.replace("/shop");
      phone.current?.contentWindow?.location.replace("/inbox");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shopper = session?.household.shopperName ?? "Shopper";
  const reviewer = session?.household.reviewerName ?? "Reviewer";
  const control = "rounded-lg border-2 border-line px-4 py-1.5 font-semibold hover:border-ink-soft disabled:opacity-50";
  // Holds wait 24 hours for the reviewer; requests stay open 7 days.
  const days = session?.relationship.flow === "request" ? 7 : 1;
  const span = days === 1 ? "24 hours" : `${days} days`;

  return (
    <div className="flex h-dvh flex-col bg-mist">
      <div className="border-b border-line bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="tablist" aria-label="Which relationship" className="flex flex-wrap gap-1 rounded-xl bg-mist p-1">
            {session?.relationships.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === session.relationship.id}
                disabled={busy}
                onClick={() => {
                  clearSavedSearch();
                  void run(`Now showing: ${r.title}.`, { action: "mode", mode: r.id });
                }}
                className={`rounded-lg px-4 py-1.5 font-semibold ${r.id === session.relationship.id ? "bg-white text-relay-deep shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {r.tab}
              </button>
            ))}
          </div>
          {session && <span className="ml-auto text-sm text-ink-soft">Build {session.build}</span>}
          <Link href="/shop" className="font-semibold text-relay underline-offset-4 hover:underline">
            Open {shopper}&apos;s app on its own
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-bold">Demo controls</p>
          <button type="button" disabled={busy} onClick={() => run(`Simulated ${span} passing.`, { action: "advance", hours: days * 24 })} className={control}>
            Simulate {span}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              clearSavedSearch();
              void run("Demo reset: default rules, no purchases.", { action: "reset" });
            }}
            className={control}
          >
            Reset this demo
          </button>
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-relay"
              checked={hidden}
              disabled={busy || !session}
              onChange={(e) => {
                clearSavedSearch();
                void run(
                  e.target.checked ? "Real store and brand names are hidden. Search again to see invented names." : "Real store and brand names are shown again.",
                  { action: "hide_brands", on: e.target.checked },
                );
              }}
            />
            Hide real store and brand names
          </label>
          <span className="text-base text-ink-soft">This demo is your own copy. Other visitors can&apos;t see or change it.</span>
          {status && (
            <p className="text-base text-ink-soft" role="status">
              {status}
            </p>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label={`${shopper}'s screen`} className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <p className="border-b border-line px-4 py-2 text-base font-semibold text-ink-soft">
            {shopper}&apos;s screen{session && `: ${session.relationship.title}`}
          </p>
          <iframe ref={left} src="/shop" title={`${shopper}'s screen`} className="min-h-0 w-full flex-1" />
        </section>
        <section aria-label={`${reviewer}'s phone`} className="flex flex-col items-center">
          <p className="mb-2 text-base font-semibold text-ink-soft">{reviewer}&apos;s phone</p>
          <div className="h-[780px] max-h-[calc(100dvh-11rem)] w-[380px] overflow-hidden rounded-[2.5rem] border-[10px] border-ink bg-white shadow-xl">
            <iframe ref={phone} src="/inbox" title={`${reviewer}'s phone`} className="size-full" />
          </div>
        </section>
      </div>
    </div>
  );
}
