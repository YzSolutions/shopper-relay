"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorNotice, Money, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, type CheckResult, type PurchaseView } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

const EXAMPLES = [
  { src: "/demo/checkout-membership.png", label: "Monitor with a membership in the small print" },
  { src: "/demo/checkout-one-time.png", label: "Monitor, one-time purchase" },
];

export default function CheckPage() {
  const router = useRouter();
  const { session } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
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
  const t = result?.terms;

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
        <p className="text-ink-soft">Or try an example (a made-up store):</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.src}
              type="button"
              disabled={busy}
              onClick={() => void checkExample(ex.src)}
              className="rounded-full border-2 border-line px-4 py-2 font-medium hover:border-relay hover:text-relay disabled:opacity-50"
            >
              {ex.label}
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
                    The wording isn&apos;t clear, so your rules treat it as recurring.
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

                {result.totalDueTodayCents !== null && (
                  <div className="space-y-3">
                    <p className="text-ink-soft">
                      You can buy it through ShopperRelay. Your rules decide whether {reviewer} takes a look first, and PayPal holds the payment until it&apos;s settled.
                    </p>
                    <Button onClick={buy} disabled={buying}>
                      {buying ? "Opening…" : "Buy it through ShopperRelay"}
                    </Button>
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
