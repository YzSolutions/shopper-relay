"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ErrorNotice, PageTitle, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { dayWords, localToday, occasionStatus, shopDay, type OccasionTone, type OccasionView } from "@/lib/client/occasions";
import { useSession } from "@/lib/client/useSession";

function CalendarLoading() {
  return (
    <div className="grid h-[38rem] place-items-center rounded-2xl border border-line">
      <Spinner label="Loading the calendar…" />
    </div>
  );
}
const OccasionCalendar = dynamic(() => import("@/components/OccasionCalendar"), { ssr: false, loading: CalendarLoading });

const TONE_CLASS: Record<OccasionTone, string> = {
  plain: "bg-mist text-ink-soft",
  due: "bg-signal-wash text-signal-text",
  waiting: "bg-signal-wash text-signal-text",
  done: "bg-ledger-wash text-ledger-deep",
  stop: "bg-stop-wash text-stop",
  past: "bg-mist text-ink-soft",
};

const AHEAD = [
  { days: 3, words: "3 days before" },
  { days: 7, words: "A week before" },
  { days: 14, words: "Two weeks before" },
];

const field = "min-h-13 w-full rounded-xl border-2 border-line bg-white px-4 text-lg focus:border-relay focus:outline-none";

/** The next Dec 18 that hasn't passed. */
function nextSecretSanta(today: string): string {
  const year = Number(today.slice(0, 4));
  return `${today.slice(5) > "12-18" ? year + 1 : year}-12-18`;
}

export default function OccasionsPage() {
  const { session } = useSession();
  const owner = session?.household.reviewerName ?? "Sarah";
  // Read in the browser after loading, so the page never bakes in the build's date.
  const [today, setToday] = useState<string | null>(null);
  const [occasions, setOccasions] = useState<OccasionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", date: "", job: "", daysAhead: 7 });

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    api<{ occasions: OccasionView[] }>("/api/occasions")
      .then((d) => {
        setToday(localToday());
        setOccasions(d.occasions);
      })
      .catch(fail);
  }, []);

  async function act(key: string, json: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const d = await api<{ occasions: OccasionView[] }>("/api/occasions", { method: "POST", json });
      setOccasions(d.occasions);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await act("add", { action: "add", ...form })) setForm({ title: "", date: "", job: "", daysAhead: 7 });
  }

  function pick(id: string) {
    setPicked(id);
    document.getElementById(`occasion-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const ready = form.title.trim().length >= 2 && form.date && form.job.trim().length >= 2;

  return (
    <div className="space-y-10">
      <PageTitle
        lead={`Birthdays, holidays, the office Secret Santa. Before each date, the AI shops for it on its own, within ${owner}'s rules. Anything outside them still goes to ${owner} first.`}
      >
        Occasions
      </PageTitle>
      <ErrorNotice error={error} />

      {today ? <OccasionCalendar occasions={occasions ?? []} today={today} owner={owner} onPick={pick} /> : <CalendarLoading />}

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="coming" className="space-y-4">
          <h2 id="coming" className="text-2xl font-bold">
            Coming up
          </h2>
          {!occasions && !error && <Spinner label="Loading…" />}
          {occasions?.length === 0 && <p className="text-lg text-ink-soft">No occasions yet. Add one, and the AI will shop for it ahead of the date.</p>}
          <ul className="space-y-3">
            {today && occasions?.map((o) => {
              const status = occasionStatus(o, today, owner);
              const shopping = busy === `shop-${o.id}`;
              return (
                <li
                  key={o.id}
                  id={`occasion-${o.id}`}
                  className={`rounded-2xl border-2 p-5 transition-colors ${picked === o.id ? "border-relay" : "border-line"}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-xl font-bold">{o.title}</h3>
                    <span className="text-lg text-ink-soft">{dayWords(o.date)}</span>
                  </div>
                  <p className="mt-1 text-lg">{o.job}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-1 font-semibold ${TONE_CLASS[status.tone]}`}>{shopping ? "Shopping now" : status.words}</span>
                    {!o.purchase && !o.shoppedAt && <span className="text-ink-soft">{AHEAD.find((a) => a.days === o.daysAhead)?.words ?? `${o.daysAhead} days before`}</span>}
                  </div>
                  {o.purchase && (
                    <p className="mt-3 text-lg">
                      {o.purchase.title}.{" "}
                      <Link href={`/purchase/${o.purchase.id}`} className="font-semibold text-relay underline underline-offset-4">
                        See what the AI did
                      </Link>
                    </p>
                  )}
                  {o.note && <p className="mt-3 text-lg text-ink-soft">{o.note}</p>}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {!o.shoppedAt && (
                      <Button onClick={() => act(`shop-${o.id}`, { action: "shop", id: o.id })} disabled={!!busy}>
                        {shopping ? "The AI is shopping…" : "Shop now"}
                      </Button>
                    )}
                    <Button tone="quiet" onClick={() => act(`remove-${o.id}`, { action: "remove", id: o.id })} disabled={!!busy}>
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {occasions && occasions.length > 0 && (
            <p className="text-ink-soft">Each morning the AI shops for the occasions whose day has come. In this demo, Shop now skips the wait.</p>
          )}
        </section>

        <section aria-labelledby="add" className="space-y-4">
          <h2 id="add" className="text-2xl font-bold">
            Add an occasion
          </h2>
          <form onSubmit={add} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-lg font-semibold">What&apos;s the occasion?</span>
              <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Leo's birthday" maxLength={80} />
            </label>
            <label className="block space-y-1">
              <span className="text-lg font-semibold">Date</span>
              <input type="date" className={field} value={form.date} min={today ?? undefined} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-lg font-semibold">What should the AI find?</span>
              <input className={field} value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} placeholder="A LEGO set under $40" maxLength={200} />
            </label>
            <label className="block space-y-1">
              <span className="text-lg font-semibold">When should it shop?</span>
              <select className={field} value={form.daysAhead} onChange={(e) => setForm({ ...form, daysAhead: Number(e.target.value) })}>
                {AHEAD.map((a) => (
                  <option key={a.days} value={a.days}>
                    {a.words}
                  </option>
                ))}
              </select>
            </label>
            {form.date && <p className="text-ink-soft">The AI shops on {dayWords(shopDay(form.date, form.daysAhead))}.</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!ready || !!busy}>
                {busy === "add" ? "Adding…" : "Add occasion"}
              </Button>
              <Button
                type="button"
                tone="quiet"
                onClick={() => setForm({ title: "Office Secret Santa", date: nextSecretSanta(localToday()), job: "Modern desk clock under $25", daysAhead: 7 })}
              >
                Try the Secret Santa example
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
