"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DemoTour } from "@/components/DemoTour";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";
import symbol from "../../../public/brand/shopperrelay-symbol.png";

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
  // On a phone the two screens can't sit side by side, so one shows at a time, filling the screen.
  const [view, setView] = useState<"shopper" | "phone">("shopper");
  const screens = useRef<HTMLDivElement>(null);
  const hidden = session?.household.hideBrands ?? false;

  /** On a phone, switch to that screen and bring it into view. */
  function show(v: "shopper" | "phone") {
    setView(v);
    if (window.matchMedia("(max-width: 1023px)").matches) screens.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const path = e.data?.openPhone;
      if (e.origin !== window.location.origin || typeof path !== "string" || !path.startsWith("/review/")) return;
      phone.current?.contentWindow?.location.replace(path);
      if (window.matchMedia("(max-width: 1023px)").matches) show("phone");
      else phone.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- show only uses refs and a state setter

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
  const control = "w-full rounded-xl border-2 border-line px-4 py-2 text-left hover:border-ink-soft disabled:opacity-50";
  // Holds wait 24 hours for the reviewer; requests stay open 7 days.
  const days = session?.relationship.flow === "request" ? 7 : 1;
  const span = days === 1 ? "24 hours" : `${days} days`;

  return (
    <div className="flex min-h-dvh flex-col bg-mist lg:h-dvh">
      <header className="border-b border-line bg-white">
        <h1 className="sr-only">ShopperRelay demo</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
          <Link href="/" aria-label="ShopperRelay home" className="shrink-0 rounded-full">
            <Image src={symbol} alt="" className="size-9" priority />
          </Link>
          <button
            type="button"
            popoverTarget="demo-controls"
            className="order-2 ml-auto flex min-h-11 items-center gap-2 rounded-xl border-2 border-line px-3.5 text-[1.0625rem] font-semibold whitespace-nowrap hover:border-ink-soft lg:order-3"
          >
            Demo controls
            <svg aria-hidden viewBox="0 0 12 8" className="w-3 fill-none stroke-current stroke-2">
              <path d="M1 1.5 6 6.5 11 1.5" />
            </svg>
          </button>
          {/* Plain buttons, not tabs: each switches the whole demo, and Tab moves between them. */}
          <div role="group" aria-label="Which relationship" className="order-3 grid w-full grid-cols-2 gap-1 rounded-2xl bg-mist p-1 lg:order-2 lg:flex lg:w-auto">
            {session?.relationships.map((r) => {
              const on = r.id === session.relationship.id;
              const ring = on ? "ring-ink" : "ring-mist";
              const [shopperName, reviewerName] = r.tab.split(" + ");
              return (
                <button
                  key={r.id}
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => {
                    clearSavedSearch();
                    void run(`Now showing: ${r.title}.`, { action: "mode", mode: r.id });
                  }}
                  className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left text-[0.9375rem] leading-tight font-semibold transition-colors lg:px-3 lg:text-[1.0625rem] ${on ? "bg-ink text-white" : "text-ink-soft hover:bg-white hover:text-ink"}`}
                >
                  {/* Who's in it: blue is the person shopping, orange the person who takes a look, as everywhere else. */}
                  <span aria-hidden className="flex shrink-0">
                    <span className={`flex size-6 items-center justify-center rounded-full bg-relay pr-0.5 text-xs font-bold text-white ring-2 ${ring}`}>{shopperName[0]}</span>
                    {/* Sarah's own tab has just her. */}
                    {reviewerName && <span className={`relative -ml-1 flex size-6 items-center justify-center rounded-full bg-signal-text text-xs font-bold text-white ring-2 ${ring}`}>{reviewerName[0]}</span>}
                  </span>
                  {r.tab}
                </button>
              );
            })}
          </div>
        </div>

        <div id="demo-controls" popover="auto" className="top-16 right-5 bottom-auto left-auto m-0 w-[23rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-white p-5 text-ink shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Demo controls</h2>
              <button type="button" popoverTarget="demo-controls" popoverTargetAction="hide" className="rounded-lg px-2 py-1 text-base font-semibold text-relay hover:bg-relay-wash">
                Close
              </button>
            </div>
            <button type="button" disabled={busy} onClick={() => run(`Simulated ${span} passing.`, { action: "advance", hours: days * 24 })} className={control}>
              <span className="block font-semibold">Simulate {span}</span>
              <span className="block text-base text-ink-soft">See what happens when nobody answers.</span>
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
              <span className="block font-semibold">Reset this demo</span>
              <span className="block text-base text-ink-soft">Default rules, no purchases.</span>
            </button>
            <label className="flex items-center gap-3 px-1 py-1 leading-snug font-semibold">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-relay"
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
            {status && (
              <p className="rounded-xl bg-relay-wash px-3 py-2 text-base" role="status">
                {status}
              </p>
            )}
            <div className="space-y-1 border-t border-line pt-3 text-base text-ink-soft">
              <Link href="/shop" className="block font-semibold text-relay underline-offset-4 hover:underline">
                Open {shopper}&apos;s app on its own
              </Link>
              <p>This demo is your own copy. Other visitors can&apos;t see or change it.</p>
              {session && <p className="text-sm">Build {session.build}</p>}
            </div>
          </div>
        </div>
      </header>

      {session && <DemoTour key={session.relationship.id} session={session} onGo={(path) => {
            left.current?.contentWindow?.location.replace(path);
            show("shopper");
          }} />}

      <div ref={screens} role="group" aria-label="Which screen" className="sticky top-0 z-10 flex scroll-mt-0 gap-1 border-b border-line bg-mist p-2 lg:hidden">
        {(["shopper", "phone"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => show(v)}
            className={`min-h-11 flex-1 rounded-xl px-2 font-semibold ${view === v ? "bg-ink text-white" : "text-ink-soft hover:bg-white hover:text-ink"}`}
          >
            {v === "shopper" ? `${shopper}'s screen` : `${reviewer}'s phone`}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 p-2 lg:grid-cols-[minmax(0,1fr)_400px] lg:p-5">
        <section aria-label={`${shopper}'s screen`} className={`${view === "shopper" ? "flex" : "hidden"} h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm lg:flex lg:h-auto lg:min-h-[28rem]`}>
          <p className="hidden border-b border-line px-4 py-2 text-base font-semibold text-ink-soft lg:block">
            {shopper}&apos;s screen{session && `: ${session.relationship.title}`}
          </p>
          <iframe ref={left} src="/shop" title={`${shopper}'s screen`} className="min-h-0 w-full flex-1" />
        </section>
        <section aria-label={`${reviewer}'s phone`} className={`${view === "phone" ? "flex" : "hidden"} h-[calc(100dvh-4.5rem)] min-h-0 flex-col items-center lg:flex lg:h-auto`}>
          <p className="mb-2 hidden text-base font-semibold text-ink-soft lg:block">{reviewer}&apos;s phone</p>
          {/* On a real phone, no phone frame inside the phone: the screen just fills it. */}
          <div className="size-full overflow-hidden rounded-2xl border border-line bg-white lg:min-h-[28rem] lg:w-[380px] lg:max-w-full lg:flex-1 lg:rounded-[2.5rem] lg:border-[10px] lg:border-ink lg:shadow-xl lg:max-h-[780px]">
            <iframe ref={phone} src="/inbox" title={`${reviewer}'s phone`} className="size-full" />
          </div>
        </section>
      </div>
    </div>
  );
}
