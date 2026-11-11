"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { historySeenKey, NO_FACTS, TOURS, type TourFacts } from "@/config/tour";
import { api, type Session } from "@/lib/client/api";
import { usePolling } from "@/lib/client/usePolling";

const HIDDEN_KEY = "shopperrelay:tourHidden";
const CHECK_EVERY_MS = 4000;
const doneCount = (f: TourFacts) => Object.values(f).filter(Boolean).length;

/**
 * A short checklist above the demo's two screens. Steps tick off from what has
 * really happened in this visitor's demo. `session` changing (a reset, say)
 * checks again straight away.
 */
export function DemoTour({ session, onGo }: { session: Session; onGo: (path: string) => void }) {
  const steps = TOURS[session.relationship.id];
  const [facts, setFacts] = useState<TourFacts>(NO_FACTS);
  const [picked, setPicked] = useState<number | null>(null);
  const [huntingId, setHuntingId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage isn't available on the server
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      // storage unavailable: the tour just shows
    }
  }, []);

  function hide(next: boolean) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable: it only lasts until the page reloads
    }
  }

  const check = useCallback(async () => {
    try {
      const { facts: fromServer, huntingId: hunting } = await api<{ facts: TourFacts; huntingId: string | null }>("/api/demo");
      let historySeen = false;
      try {
        historySeen = localStorage.getItem(historySeenKey(session.household.id)) === "1";
      } catch {
        // storage unavailable: that step just stays to do
      }
      const next = { ...fromServer, historySeen };
      setFacts(next);
      setHuntingId(hunting);
      // Something changed: go back to following the next step to do.
      if (seen.current !== doneCount(next)) setPicked(null);
      seen.current = doneCount(next);
    } catch {
      // the tour is only a help: try again at the next check
    }
  }, [session.household.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the demo changes
    void check();
  }, [check, session]);

  const allDone = steps.every((s) => facts[s.fact]);
  usePolling(check, CHECK_EVERY_MS, !hidden && !allDone);

  if (hidden) {
    return (
      <div className="border-b border-line bg-white px-5 py-1.5">
        <button type="button" onClick={() => hide(false)} className="text-base font-semibold text-relay underline-offset-4 hover:underline">
          Show the guided tour
        </button>
      </div>
    );
  }

  const nextToDo = steps.findIndex((s) => !facts[s.fact]);
  const current = picked ?? (nextToDo < 0 ? null : nextToDo);
  const step = current === null ? null : steps[current];
  const waiting = !!step?.goHunting && !huntingId && !facts[step.fact];
  const go = step?.go ?? (step?.goHunting && huntingId ? { path: `/purchase/${huntingId}`, label: "Open the purchase" } : null);

  return (
    <section aria-labelledby="tour-title" className="grid items-center gap-x-8 gap-y-2.5 border-b border-line bg-white px-5 py-2.5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <h2 id="tour-title" className="sr-only">
        Guided tour
      </h2>
      <p className="sr-only" role="status">
        {steps.filter((s) => facts[s.fact]).length} of {steps.length} done
      </p>

      {/* The same idea as the track on a purchase: stations on a line, handing on from one to the next. */}
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const done = facts[s.fact];
          const on = i === current;
          return (
            <li key={s.title} className="relative min-w-0 flex-1">
              {i > 0 && <span aria-hidden className={`absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2 transition-colors ${facts[steps[i - 1].fact] ? "bg-ledger" : "bg-line"}`} />}
              <button type="button" aria-current={on ? "step" : undefined} onClick={() => setPicked(i)} className="group relative z-10 flex w-full flex-col items-center gap-1 rounded-lg text-center">
                <span
                  aria-hidden
                  className={`flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                    done ? "border-ledger bg-ledger text-white" : on ? "border-relay bg-relay text-white" : "border-line bg-white text-ink-soft group-hover:border-ink-soft"
                  } ${on ? `ring-4 ${done ? "ring-ledger-wash" : "ring-relay-wash"}` : ""}`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`hidden px-1 text-[0.9375rem] leading-tight sm:block ${on ? "font-bold text-ink" : "font-medium text-ink-soft group-hover:text-ink"}`}>{s.title}</span>
                <span className="sr-only sm:hidden">{s.title}</span>
                {done && <span className="sr-only"> (done)</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-mist px-4 py-2.5">
        <div className="min-w-[16rem] flex-1 text-[1.0625rem] leading-snug">
          {step ? (
            <>
              <p>
                <strong className="font-bold">{step.title}.</strong> {waiting ? "Do the step before this one first. The button appears once Marcus has set a price." : step.how}
              </p>
              {step.pays && <TestCard />}
            </>
          ) : (
            <p>
              <strong className="font-bold">That&apos;s this setup done.</strong> Try another one with the tabs above, or use Reset this demo in Demo controls to run it again.
            </p>
          )}
        </div>
        {go && (
          <button type="button" onClick={() => onGo(go.path)} className="min-h-11 rounded-xl bg-relay px-4 text-[1.0625rem] font-semibold whitespace-nowrap text-white hover:bg-relay-deep">
            {go.label}
          </button>
        )}
        <button type="button" onClick={() => hide(true)} className="min-h-11 px-1 text-[0.9375rem] font-semibold whitespace-nowrap text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          Hide the tour
        </button>
      </div>
    </section>
  );
}

const TEST_CARD = "4111 1111 1111 1111";

/** PayPal's window wants a card typed in, so make it one tap to carry over. */
function TestCard() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(TEST_CARD.replaceAll(" ", ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable: the number is right there to read
    }
  }
  return (
    <p className="mt-0.5 text-[0.9375rem] leading-snug text-ink-soft">
      Test card: <span className="font-semibold tabular-nums">{TEST_CARD}</span>, any future date, any CVV.{" "}
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-6 items-center px-1 font-semibold text-relay underline-offset-4 hover:underline">
        {copied ? "Copied" : "Copy"}
      </button>
    </p>
  );
}
