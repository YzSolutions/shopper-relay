"use client";

import { useEffect, useState } from "react";
import { api, type RuleHistoryEntry, type RuleSet } from "@/lib/client/api";
import { ruleDiff } from "@/lib/client/describe";

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Every rule change, newest first, loaded again whenever `refresh` changes. */
export function useRuleHistory(refresh: unknown) {
  const [history, setHistory] = useState<RuleHistoryEntry[] | null>(null);
  useEffect(() => {
    let gone = false;
    api<{ history: RuleHistoryEntry[] }>("/api/rules/history")
      .then((r) => !gone && setHistory(r.history))
      .catch(() => !gone && setHistory([]));
    return () => {
      gone = true;
    };
  }, [refresh]);
  return history;
}

const SHOWN = 5;

/** Only the parts of the rules that differ, before and after. */
export function RuleChangeList({
  before,
  after,
  reviewer,
  flow,
  afterLabel = "After:",
  shopper,
}: {
  before: RuleSet;
  after: RuleSet;
  reviewer: string;
  flow: "hold" | "request";
  afterLabel?: string;
  /** Word it for the reviewer: "Mom buys without asking" instead of "you buy on your own". */
  shopper?: string;
}) {
  return (
    <dl className="mt-3 space-y-3">
      {ruleDiff(before, after, reviewer, flow, shopper).map((line) => (
        <div key={line.label}>
          <dt className="font-bold">{line.label}</dt>
          <dd className="text-ink-soft">
            <span className="font-semibold text-ink">Before:</span> {line.before}
          </dd>
          <dd className="text-ink-soft">
            <span className="font-semibold text-ink">{afterLabel}</span> {line.after}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The full record on the Rules page: what changed, who changed it, and when. */
export function RuleHistory({ refresh, reviewer, flow }: { refresh: unknown; reviewer: string; flow: "hold" | "request" }) {
  const history = useRuleHistory(refresh);
  const [all, setAll] = useState(false);
  if (!history) return null;
  const shown = all ? history : history.slice(0, SHOWN);

  return (
    <section aria-labelledby="history" className="space-y-4">
      <h2 id="history" className="text-2xl font-bold">
        Rule history
      </h2>
      <p className="text-ink-soft">Every change is kept here, newest first. No one can edit or delete it.</p>
      {history.length === 0 && <p className="text-lg">No changes yet. These are the starting rules.</p>}
      <ol className="space-y-4">
        {shown.map((h) => (
          <li key={h.id} className="rounded-2xl border-2 border-line p-5">
            <p className="text-base text-ink-soft">{when(h.at)}</p>
            <p className="mt-1 text-lg font-semibold">{h.message}</p>
            {h.change && <RuleChangeList {...h.change} reviewer={reviewer} flow={flow} afterLabel={h.change.status === "dropped" ? "Asked for:" : "After:"} />}
          </li>
        ))}
      </ol>
      {history.length > SHOWN && !all && (
        <button type="button" onClick={() => setAll(true)} className="text-lg font-semibold text-relay underline-offset-4 hover:underline">
          Show {history.length - SHOWN} older {history.length - SHOWN === 1 ? "change" : "changes"}
        </button>
      )}
    </section>
  );
}

/** One short text-message line for the reviewer, e.g. "Mom changed Clothing. It starts on its own Monday 11:30 PM." */
function phoneLine(h: RuleHistoryEntry, shopper: string, what: string, shownAbove: boolean): string {
  switch (h.type) {
    case "rules_activated":
      return `${shopper}'s change to ${what} started.`;
    case "rules_change_dropped":
      return `${shopper} withdrew the change to ${what}.`;
    case "rules_approved":
      return `The change to ${what} applies now.`;
    case "rules_delayed":
      return `The change to ${what} is delayed 3 days.`;
    case "rules_changed":
      return h.change?.status === "waiting" ? `${shopper} wants to change ${what}.${shownAbove ? " See above." : ""}` : `${shopper} changed ${what}. It applies now.`;
  }
}

/** The short lines the reviewer's phone gets when someone else changes the rules. */
export function RuleUpdateLines({
  history,
  shopper,
  reviewer,
  flow,
  waiting,
}: {
  history: RuleHistoryEntry[] | null;
  shopper: string;
  reviewer: string;
  flow: "hold" | "request";
  /** A change is waiting and shown above these lines. */
  waiting: boolean;
}) {
  const lines = (history ?? []).filter((h) => h.actor !== "reviewer").slice(0, 3);
  if (!lines.length) return null;
  return (
    <section aria-labelledby="rule-updates" className="space-y-3">
      <h2 id="rule-updates" className="text-lg font-bold">
        Rule updates
      </h2>
      <ul className="space-y-3">
        {lines.map((h, i) => {
          const labels = h.change ? ruleDiff(h.change.before, h.change.after, reviewer, flow).map((l) => l.label) : [];
          return (
            <li key={h.id} className="rounded-2xl bg-mist px-4 py-3">
              <p>{phoneLine(h, shopper, labels.length ? labels.join(", ") : "the rules", waiting && i === 0)}</p>
              <p className="mt-1 text-base text-ink-soft">{when(h.at)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
