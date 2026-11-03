"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NO_FACTS, TOURS, type TourFacts } from "@/config/tour";
import { api, type Session } from "@/lib/client/api";

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
      const { facts: next, huntingId: hunting } = await api<{ facts: TourFacts; huntingId: string | null }>("/api/demo");
      setFacts(next);
      setHuntingId(hunting);
      // Something changed: go back to following the next step to do.
      if (seen.current !== doneCount(next)) setPicked(null);
      seen.current = doneCount(next);
    } catch {
      // the tour is only a help: try again at the next check
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the demo changes
    void check();
  }, [check, session]);

  const allDone = steps.every((s) => facts[s.fact]);
  useEffect(() => {
    if (hidden || allDone) return;
    const t = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => clearInterval(t);
  }, [hidden, allDone, check]);

  if (hidden) {
    return (
      <div className="border-b border-line bg-white px-5 py-2">
        <button type="button" onClick={() => hide(false)} className="font-semibold text-relay underline-offset-4 hover:underline">
          Show the guided tour
        </button>
      </div>
    );
  }

  const nextToDo = steps.findIndex((s) => !facts[s.fact]);
  const current = picked ?? (nextToDo < 0 ? null : nextToDo);
  const step = current === null ? null : steps[current];
  const go = step?.go ?? (step?.goHunting && huntingId ? { path: `/purchase/${huntingId}`, label: "Open the purchase" } : null);

  return (
    <section aria-labelledby="tour-title" className="border-b border-line bg-white px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="tour-title" className="text-lg font-bold">
          Guided tour
        </h2>
        <p className="text-base text-ink-soft" role="status">
          {steps.filter((s) => facts[s.fact]).length} of {steps.length} done
        </p>
        <button type="button" onClick={() => hide(true)} className="ml-auto text-base font-semibold text-relay underline-offset-4 hover:underline">
          Hide the tour
        </button>
      </div>

      <ol className="mt-2 flex flex-wrap gap-2">
        {steps.map((s, i) => {
          const done = facts[s.fact];
          return (
            <li key={s.title}>
              <button
                type="button"
                aria-current={i === current ? "step" : undefined}
                onClick={() => setPicked(i)}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-1 text-base font-semibold ${
                  i === current ? "border-relay bg-relay-wash text-relay-deep" : "border-line text-ink-soft hover:border-ink-soft"
                }`}
              >
                <span aria-hidden className={`flex size-6 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-ledger text-white" : "bg-mist text-ink-soft"}`}>
                  {done ? "✓" : i + 1}
                </span>
                {s.title}
                {done && <span className="sr-only"> (done)</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {step ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="max-w-4xl text-base">
            {step.how}
            {step.pays && (
              <span className="text-ink-soft">
                {" "}
                In PayPal&apos;s window, choose Debit or Credit Card and use the sandbox test card 4111 1111 1111 1111, any future date, any CVV. No real money moves.
              </span>
            )}
          </p>
          {go && (
            <button
              type="button"
              onClick={() => onGo(go.path)}
              className="rounded-lg border-2 border-relay px-3 py-1 text-base font-semibold text-relay hover:bg-relay hover:text-white"
            >
              {go.label}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-base">That&apos;s this setup done. Try another one with the tabs above, or use Reset this demo to run it again.</p>
      )}
    </section>
  );
}
