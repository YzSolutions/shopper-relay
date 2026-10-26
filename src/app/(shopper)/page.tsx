"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { RELATIONSHIPS } from "@/config/relationships";
import { BudgetBars, Button, CountedAs, ErrorNotice, Money, OutcomeLine, Spinner } from "@/components/ui";
import { api, type PurchaseView, type SearchResult } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

const SAVED_PREFIX = "shopperrelay:lastSearch:v4:";

// A point with ids can be tapped to show just those products.
type Explanation = { summary: string; points: Array<{ text: string; ids: string[] }>; notes: Array<{ id: string; note: string }> };

export default function ShopPage() {
  const router = useRouter();
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searched, setSearched] = useState("");
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  // The summary is a nice-to-have: if it can't be had, stop showing "Reading the results…".
  const [explainFailed, setExplainFailed] = useState(false);
  // Which point the results are narrowed to, if any.
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);

  // Next.js keeps this page alive when you go back to it; clear any "Opening…" left over from leaving.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs each time the page is shown again
    setChoosing(null);
  }, []);
  const [error, setError] = useState<string | null>(null);

  // Coming back from a purchase shows the same results again (kept per relationship).
  const mode = session?.household.relationship ?? null;
  const savedKey = mode ? SAVED_PREFIX + mode : null;
  useEffect(() => {
    if (!savedKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(savedKey) ?? "null");
      if (saved?.results) {
        /* eslint-disable react-hooks/set-state-in-effect -- restoring saved results once */
        setQuery(saved.query);
        setSearched(saved.query);
        setResults(saved.results);
        setExplanation(saved.explanation ?? null);
        setExplainFailed(!saved.explanation);
        setPicked(null);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // nothing saved, or storage unavailable
    }
  }, [savedKey]);

  async function search(q: string) {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setExplanation(null);
    setExplainFailed(false);
    setPicked(null);
    try {
      const data = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(text)}`);
      setResults(data.results);
      setSearched(text);
      save(text, data.results, null);
      if (data.results.length) explain(text, data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function explain(q: string, rs: SearchResult[]) {
    try {
      const ex = await api<Explanation>("/api/search/explain", { method: "POST", json: { query: q, products: rs.slice(0, 12).map((r) => r.product) } });
      setExplanation(ex);
      save(q, rs, ex);
    } catch {
      // The plain-language summary is a nice-to-have; results still work without it.
      setExplainFailed(true);
    }
  }

  function save(q: string, rs: SearchResult[], ex: Explanation | null) {
    try {
      if (savedKey) sessionStorage.setItem(savedKey, JSON.stringify({ query: q, results: rs, explanation: ex }));
    } catch {
      // storage full or unavailable
    }
  }

  async function choose(sourceId: string, merchant?: string) {
    setChoosing(`${sourceId}:${merchant ?? ""}`);
    setError(null);
    try {
      const { purchase } = await api<{ purchase: PurchaseView }>("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId, merchant } });
      router.push(`/purchase/${purchase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChoosing(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void search(query);
  };
  const reviewer = session?.household.reviewerName ?? "your trusted contact";
  const relationship = session ? RELATIONSHIPS[session.household.relationship] : null;
  const flow = relationship?.flow ?? "hold";
  const notes = new Map(explanation?.notes.map((n) => [n.id, n.note]));
  const pickedPoint = picked === null ? undefined : explanation?.points[picked];
  const shown = pickedPoint ? (results ?? []).filter((r) => pickedPoint.ids.includes(r.product.sourceId)) : (results ?? []);

  return (
    <div className="max-w-3xl">
      <form onSubmit={onSubmit} role="search">
        <h1 className="text-[2.125rem] leading-tight font-extrabold sm:text-[2.5rem]">
          <label htmlFor="q">{relationship?.words.shopHeading ?? "What are you shopping for?"}</label>
        </h1>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            id="q"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={relationship?.words.placeholder ?? ""}
            autoComplete="off"
            className="min-h-15 flex-1 rounded-xl border-2 border-line bg-white px-5 text-xl placeholder:text-ink-soft/70 focus:border-relay focus:outline-none"
          />
          <Button type="submit" disabled={busy || !query.trim()} className="min-h-15 px-8 text-xl">
            Search
          </Button>
        </div>
      </form>

      {!results && !busy && (
        <div className="mt-6">
          <p className="text-ink-soft">Or try one of these:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(relationship?.words.suggestions ?? []).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s);
                  void search(s);
                }}
                className="rounded-full border-2 border-line px-4 py-2 font-medium hover:border-relay hover:text-relay"
              >
                {s}
              </button>
            ))}
          </div>
          {session && relationship && (
            <p className="mt-10 max-w-[36rem] text-ink-soft">
              {flow === "hold"
                ? `You choose what to buy. Your own rules decide when ${reviewer} takes a look first, and PayPal holds the payment until it's settled.`
                : relationship.summary}
            </p>
          )}
          {session && session.budget.length > 0 && (
            <div className="mt-8 max-w-md">
              <BudgetBars lines={session.budget} title="Your budget" />
            </div>
          )}
        </div>
      )}

      <div className="mt-8 space-y-6">
        <ErrorNotice error={error} />
        {busy && <Spinner label="Searching stores…" />}
      </div>

      {results && !busy && (
        <section aria-labelledby="results-heading" className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 id="results-heading" className="text-2xl font-bold">
              {results.length ? `${results.length} results for “${searched}”` : `Nothing found for “${searched}”`}
            </h2>
            {results.length > 0 && <p className="text-base text-ink-soft">Different products, not the same item</p>}
          </div>

          {results.length > 0 && (
            <div className="mt-5 rounded-xl bg-mist px-6 py-5">
              <h3 className="text-xl font-bold">In plain words</h3>
              <PriceRange results={results} />
              {explanation ? (
                <>
                  <p className="mt-2 text-[1.375rem] leading-snug font-semibold">{explanation.summary}</p>
                  {explanation.points?.length > 0 && (
                    <ul className="-mx-3 mt-3 space-y-1 text-xl">
                      {explanation.points.map((p, i) => {
                        const dot = <span aria-hidden className="mt-2.5 size-2.5 shrink-0 rounded-full bg-relay" />;
                        if (!p.ids.length) {
                          return (
                            <li key={p.text} className="flex gap-3 border-2 border-transparent px-3 py-2">
                              {dot}
                              <span>{p.text}</span>
                            </li>
                          );
                        }
                        const on = picked === i;
                        return (
                          <li key={p.text}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => setPicked(on ? null : i)}
                              className={`flex w-full gap-3 rounded-lg border-2 px-3 py-2 text-left transition-colors ${on ? "border-relay bg-white" : "border-transparent hover:border-line hover:bg-white/70"}`}
                            >
                              {dot}
                              <span className="flex-1">{p.text}</span>
                              <span className="mt-0.5 shrink-0 text-lg font-semibold whitespace-nowrap text-relay">{on ? "Showing" : `See ${p.ids.length}`}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {explanation.points?.some((p) => p.ids.length) && <p className="mt-2 text-base text-ink-soft">Tap a point to see just those products.</p>}
                </>
              ) : (
                !explainFailed && (
                  <div className="mt-2">
                    <Spinner label="Reading the results…" />
                  </div>
                )
              )}
            </div>
          )}

          {pickedPoint && (
            <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-relay px-5 py-3">
              <p className="text-lg">
                <span className="font-semibold">
                  Showing {shown.length} of {results.length}:
                </span>{" "}
                {pickedPoint.text}
              </p>
              <Button tone="quiet" onClick={() => setPicked(null)}>
                Show all {results.length}
              </Button>
            </div>
          )}

          <ol className="mt-2">
            {shown.map((r) => (
              <ResultRow
                key={r.product.sourceId}
                result={r}
                note={notes.get(r.product.sourceId)}
                reviewer={r.preview?.reviewer ?? reviewer}
                flow={flow}
                standing={!!session?.standing}
                chooseLabel={relationship ? relationship.words.choose(r.preview?.reviewer ?? reviewer) : "Choose this"}
                choosing={choosing}
                onChoose={choose}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ResultRow({
  result,
  note,
  reviewer,
  flow,
  standing,
  chooseLabel,
  choosing,
  onChoose,
}: {
  result: SearchResult;
  note?: string;
  reviewer: string;
  flow: "hold" | "request";
  /** Request flow: the payer's standing permission is on. */
  standing: boolean;
  chooseLabel: string;
  choosing: string | null;
  onChoose: (sourceId: string, merchant?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { product, category, preview } = result;
  const best = product.offers.find((o) => o.available);
  const others = product.offers.filter((o) => o !== best);
  const busy = choosing !== null;

  return (
    <li className="border-b border-line py-6">
      <div className="flex gap-5">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-white sm:size-28">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- catalog images come from many retailer hosts
            <img src={product.imageUrl} alt="" className={`size-full object-contain ${product.imageHidden ? "scale-110 blur-md" : ""}`} loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold">{product.title}</h3>
          {product.brand && <p className="text-ink-soft">{product.brand}</p>}
          {best ? (
            <p className="mt-2 text-lg">
              <Money cents={best.priceCents} currency={best.currency} className="text-2xl font-extrabold" />
              <span className="text-ink-soft"> at {best.merchant}</span>
              {best.compareAtCents && best.compareAtCents > best.priceCents && (
                <span className="text-ink-soft">
                  {" "}
                  (was <Money cents={best.compareAtCents} />)
                </span>
              )}
            </p>
          ) : (
            <p className="mt-2 font-semibold text-ink-soft">Out of stock everywhere right now</p>
          )}
          <p className="mt-1">
            <CountedAs category={category.primary} />
            {category.basis === "ambiguous" && <span className="text-ink-soft"> (unclear, so the stricter rule applies)</span>}
          </p>
          {preview && <OutcomeLine outcome={preview.outcome} reviewer={reviewer} flow={flow} standing={standing} className="mt-2" />}
          {note && <p className="mt-2 text-ink-soft">{note}</p>}

          {best && preview?.outcome !== "blocked" && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onChoose(product.sourceId, best.merchant)}
                className="min-h-12 rounded-xl bg-relay px-5 font-semibold text-white hover:bg-relay-deep disabled:opacity-50"
              >
                {choosing === `${product.sourceId}:${best.merchant}` ? "Opening…" : chooseLabel}
              </button>
              {others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                  className="min-h-12 rounded-xl border-2 border-line px-5 font-semibold hover:border-ink-soft"
                >
                  {open ? "Hide other stores" : `Same item at ${others.length} other ${others.length === 1 ? "store" : "stores"}`}
                </button>
              )}
            </div>
          )}

          {open && (
            <div className="mt-4 rounded-xl border-2 border-line">
              <p className="border-b border-line px-4 py-3 text-base text-ink-soft">
                The same product, listed by other stores. Prices and stock can change.
              </p>
              <ul>
                {others.map((o) => (
                  <li key={o.merchant} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span>
                      <Money cents={o.priceCents} currency={o.currency} className="font-bold" /> at {o.merchant}
                      {!o.available && <span className="text-ink-soft"> (out of stock)</span>}
                    </span>
                    {o.available && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onChoose(product.sourceId, o.merchant)}
                        className="min-h-11 rounded-lg border-2 border-relay px-4 font-semibold text-relay hover:bg-relay-wash disabled:opacity-50"
                      >
                        Choose this store
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** The price range across every result, worked out here rather than by the AI. */
function PriceRange({ results }: { results: SearchResult[] }) {
  const prices = results.flatMap((r) => {
    const best = r.product.offers.find((o) => o.available);
    return best ? [best.priceCents] : [];
  });
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return (
    <p className="mt-2 text-[1.375rem] leading-snug font-semibold">
      {min === max ? (
        <>
          All {prices.length} are <Money cents={min} />.
        </>
      ) : (
        <>
          Prices go from <Money cents={min} /> to <Money cents={max} /> across all {prices.length} results.
        </>
      )}
    </p>
  );
}
