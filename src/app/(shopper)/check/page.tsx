"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorNotice, Money, Notice, OutcomeLine, PageTitle, Spinner } from "@/components/ui";
import { api, type CheckResult, type PurchaseView } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

// Sample checkouts from a made-up store. Product search can't show a subscription (store listings
// carry no checkout terms), so these are how people try hidden-charge detection.
const EXAMPLES = [
  {
    src: "/demo/checkout-membership.png",
    label: "A checkout with a membership in the small print",
    what: "A $149 blood pressure monitor. The small print adds a $39-a-month membership after a free trial.",
  },
  {
    src: "/demo/checkout-one-time.png",
    label: "A plain one-time checkout",
    what: "The same $149 monitor with no repeat charges, to compare.",
  },
];

export default function CheckPage() {
  const router = useRouter();
  const { session } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);

  // Next.js keeps this page alive on back navigation; don't leave the button stuck on "Opening…".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs each time the page is shown again
    setBuying(false);
  }, []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview?.startsWith("blob:") && URL.revokeObjectURL(preview)), [preview]);

  async function check(file: Blob, shownAs: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(shownAs);
    try {
      const form = new FormData();
      form.append("image", file, "screenshot");
      setResult(await api<CheckResult>("/api/check", { method: "POST", body: form }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkExample(src: string) {
    const blob = await (await fetch(src)).blob();
    await check(blob, src);
  }

  async function buy() {
    if (!result) return;
    setBuying(true);
    setError(null);
    try {
      const { purchase } = await api<{ purchase: PurchaseView }>("/api/purchases", { method: "POST", json: { kind: "checked", checkId: result.checkId } });
      router.push(`/purchase/${purchase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBuying(false);
    }
  }

  const reviewer = session?.household.reviewerName ?? "your trusted contact";
  const request = session?.relationship.flow === "request";
  const t = result?.terms;
  const decision = result?.decision ?? null;
  const blocked = decision?.outcome === "blocked";
  const asked = decision?.reviewer ?? reviewer;
  const ownRules = session?.owner === "shopper";

  return (
    <div className="max-w-4xl">
      <PageTitle lead="Found something on another website? Take a screenshot of the checkout page. We'll read the small print and tell you what you'd really be paying.">
        Check before you buy
      </PageTitle>

      <div className="flex flex-wrap items-center gap-4">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          id="screenshot"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void check(f, URL.createObjectURL(f));
            e.target.value = "";
          }}
        />
        <Button onClick={() => input.current?.click()} disabled={busy}>
          Choose a screenshot
        </Button>
        <p className="text-base text-ink-soft">PNG, JPEG or WebP. The picture isn&apos;t kept, only what we read from it.</p>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold">No screenshot handy? Try one of these</h2>
        <p className="mt-1 text-ink-soft">Two checkouts from a made-up store. Product search can&apos;t show memberships like this, so this is the place to test hidden charges.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.src}
              type="button"
              disabled={busy}
              onClick={() => void checkExample(ex.src)}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-line text-left hover:border-relay disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a small static sample shown as-is */}
              <img src={ex.src} alt="" className="h-36 w-full object-cover object-top" />
              <span className="space-y-1 border-t border-line p-4">
                <span className="block font-semibold">{ex.label}</span>
                <span className="block text-ink-soft">{ex.what}</span>
                <span className="block pt-1 font-semibold text-relay">Check this checkout</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <ErrorNotice error={error} />
      </div>

      {(busy || result) && (
        <div className="mt-6 grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own screenshot
            <img src={preview} alt="The screenshot being checked" className="w-full self-start rounded-xl border border-line" />
          )}
          <div className="min-w-0 space-y-6">
            {busy && <Spinner label="Reading the small print…" />}
            {t && result && !t.readable && (
              <Notice tone="stop" title="We couldn't read a checkout page in that picture.">
                Try a clearer screenshot that shows the price and the text near the order button.
              </Notice>
            )}
            {t && result && t.readable && (
              <>
                {result.recurring === "yes" ? (
                  <Notice tone="signal" title="This isn't a one-time purchase.">
                    {result.totalDueTodayCents !== null && (
                      <>
                        <Money cents={result.totalDueTodayCents} className="font-bold" /> today
                      </>
                    )}
                    {result.recurringCents !== null && (
                      <>
                        , then <Money cents={result.recurringCents} className="font-bold" /> every {t.recurring.interval ?? "period"}
                      </>
                    )}
                    {t.recurring.startsWhen && <> {t.recurring.startsWhen}</>}.
                  </Notice>
                ) : result.recurring === "uncertain" ? (
                  <Notice tone="signal" title="There might be a repeat charge.">
                    The wording isn&apos;t clear, so {ownRules ? "your rules treat" : `${reviewer}'s rules treat`} it as recurring.
                  </Notice>
                ) : (
                  <Notice tone="ledger" title="No recurring charge is listed.">
                    {result.totalDueTodayCents !== null && (
                      <>
                        <Money cents={result.totalDueTodayCents} className="font-bold" /> today, one time.
                      </>
                    )}
                  </Notice>
                )}

                <p className="text-lg">{t.plainSummary}</p>

                {t.recurring.evidence.length > 0 && (
                  <div>
                    <p className="font-bold">In the small print</p>
                    {t.recurring.evidence.map((q) => (
                      <blockquote key={q} className="mt-2 border-l-4 border-signal pl-4 text-ink-soft">
                        {q}
                      </blockquote>
                    ))}
                  </div>
                )}

                <dl className="divide-y divide-line border-y border-line">
                  {(
                    [
                      ["Item", t.productName],
                      ["Store", t.seller],
                      ["Shipping", t.shippingDollars === null ? null : t.shippingDollars === 0 ? "Free" : `$${t.shippingDollars.toFixed(2)}`],
                      ["Trial", t.trial],
                      ["Cancelling", t.cancellation],
                      ["Returns", t.returns],
                      ...t.otherImportantTerms.map((x) => ["Also", x] as const),
                    ] as Array<readonly [string, string | null]>
                  )
                    .filter(([, v]) => v)
                    .map(([k, v], i) => (
                      <div key={`${k}${i}`} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                        <dt className="text-ink-soft">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>

                {result.totalDueTodayCents !== null && decision && (
                  <div className="space-y-3">
                    <OutcomeLine outcome={decision.outcome} reviewer={asked} flow={request ? "request" : "hold"} standing={!!session?.standing} />
                    <ul className="space-y-1 text-ink-soft">
                      {decision.reasons.map((r, i) => (
                        <li key={i}>{r.message}</li>
                      ))}
                    </ul>
                    {!blocked && (
                      <>
                        <p className="text-ink-soft">
                          {request
                            ? `You can send it to ${asked}. ${asked} sees what you saw here, then decides and pays.`
                            : `You can buy it through ShopperRelay. PayPal holds the payment until it's settled.`}
                        </p>
                        <Button onClick={buy} disabled={buying}>
                          {buying ? "Opening…" : request ? `Ask ${asked} about it` : "Buy it through ShopperRelay"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
