"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

function clearSavedSearch() {
  try {
    sessionStorage.clear();
  } catch {
    // storage unavailable
  }
}

// Split screen for the video and for judges: the shopper's app on the left,
// the reviewer's phone on the right, and demo-only controls above.

export default function DemoPage() {
  const mom = useRef<HTMLIFrameElement>(null);
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
      mom.current?.contentWindow?.location.reload();
      phone.current?.contentWindow?.location.reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-mist">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-5 py-3">
        <p className="font-bold">Demo controls</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("Simulated 24 hours passing.", { action: "advance", hours: 24 })}
          className="rounded-lg border-2 border-line px-4 py-1.5 font-semibold hover:border-ink-soft disabled:opacity-50"
        >
          Simulate 24 hours
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            clearSavedSearch();
            void run("Demo reset: Mom's default rules, no purchases.", { action: "reset" });
          }}
          className="rounded-lg border-2 border-line px-4 py-1.5 font-semibold hover:border-ink-soft disabled:opacity-50"
        >
          Reset demo
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
        {status && <p className="text-base text-ink-soft" role="status">{status}</p>}
        <Link href="/" className="ml-auto font-semibold text-relay underline-offset-4 hover:underline">
          Open the shopper app on its own
        </Link>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Mom's screen" className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <p className="border-b border-line px-4 py-2 text-base font-semibold text-ink-soft">Mom&apos;s screen</p>
          <iframe ref={mom} src="/" title="Mom's screen" className="min-h-0 w-full flex-1" />
        </section>
        <section aria-label="Sarah's phone" className="flex flex-col items-center">
          <p className="mb-2 text-base font-semibold text-ink-soft">Sarah&apos;s phone</p>
          <div className="h-[780px] max-h-[calc(100dvh-9rem)] w-[380px] overflow-hidden rounded-[2.5rem] border-[10px] border-ink bg-white shadow-xl">
            <iframe ref={phone} src="/sarah" title="Sarah's phone" className="size-full" />
          </div>
        </section>
      </div>
    </div>
  );
}
