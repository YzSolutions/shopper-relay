"use client";

import { useState, type FormEvent } from "react";
import { Button, ButtonLink, ErrorNotice, Notice, Spinner } from "@/components/ui";
import { api, type AgentStep, type PurchaseView, type Session } from "@/lib/client/api";

// The AI Shopper's screen: give it a job, then see what it did and why.

export function AiGoal({ session, heading, placeholder, suggestions }: { session: Session; heading: string; placeholder: string; suggestions: string[] }) {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<{ steps: AgentStep[]; purchase: PurchaseView | null } | null>(null);
  const owner = session.household.reviewerName;

  async function send(text: string) {
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      setRun(await api<{ steps: AgentStep[]; purchase: PurchaseView | null }>("/api/agent", { method: "POST", json: { goal: text } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(goal);
  };
  const bought = run?.purchase?.state === "completed";

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={onSubmit}>
        <h1 className="text-[2.125rem] leading-tight font-extrabold sm:text-[2.5rem]">
          <label htmlFor="goal">{heading}</label>
        </h1>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            id="goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="min-h-15 flex-1 rounded-xl border-2 border-line bg-white px-5 text-xl placeholder:text-ink-soft/70 focus:border-relay focus:outline-none"
          />
          <Button type="submit" disabled={running || goal.trim().length < 2} className="min-h-15 px-8 text-xl">
            Send the AI shopper
          </Button>
        </div>
      </form>

      {!run && !running && (
        <div>
          <p className="text-ink-soft">Or try one of these:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setGoal(s)} className="rounded-full border-2 border-line px-4 py-2 font-medium hover:border-relay hover:text-relay">
                {s}
              </button>
            ))}
          </div>
          <p className="mt-8 max-w-[36rem] text-ink-soft">
            {session.standing
              ? `Within ${owner}'s rules it buys with ${owner}'s saved PayPal. Anything else goes to ${owner} first.`
              : `${owner} hasn't saved PayPal yet, so everything it finds goes to ${owner} first.`}
          </p>
        </div>
      )}

      <ErrorNotice error={error} />
      {running && <Spinner label="The AI shopper is looking. This takes up to half a minute…" />}

      {run && (
        <section aria-labelledby="ai-did" className="space-y-4 rounded-2xl bg-relay-wash/60 p-5">
          <h2 id="ai-did" className="text-xl font-bold">
            What the AI shopper did
          </h2>
          <ol className="list-decimal space-y-2 pl-6">
            {run.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
          {run.purchase && (
            <ButtonLink href={`/purchase/${run.purchase.id}`}>{bought ? "See the purchase" : `See the request to ${owner}`}</ButtonLink>
          )}
          {!run.purchase && <Notice tone="relay">Nothing was bought. Try describing it another way.</Notice>}
        </section>
      )}
    </div>
  );
}
