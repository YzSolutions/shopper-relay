"use client";

import { useState } from "react";
import { RulesTable } from "@/components/RulesTable";
import { Button, ErrorNotice, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, ApiError, type ParsedRules } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

const EXAMPLE =
  "I can buy clothes under $80 and medical devices under $100 on my own. Anything else under $75. Above that, Sarah takes a look. Any subscription goes to Sarah.";

export default function RulesPage() {
  const { session, error: loadError, reload } = useSession();
  const [text, setText] = useState("");
  const [startFresh, setStartFresh] = useState(false);
  const [parsed, setParsed] = useState<ParsedRules | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | "pending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!session) return loadError ? <ErrorNotice error={loadError} /> : <Spinner label="Loading your rules…" />;
  const reviewer = session.household.reviewerName;
  const pending = session.pending;

  async function read() {
    setBusy("read");
    setError(null);
    setSaved(null);
    try {
      setParsed(await api<ParsedRules>("/api/rules/parse", { method: "POST", json: { text, startFresh } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!parsed) return;
    setBusy("save");
    setError(null);
    try {
      const res = await api<{ message: string }>("/api/rules", { method: "POST", json: { rules: parsed.rules, by: "shopper" } });
      setSaved(res.message);
      setParsed(null);
      setText("");
      await reload();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data.questions)) setError(`Some amounts aren't covered yet: ${(e.data.questions as string[]).join(" ")}`);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("pending");
    setError(null);
    try {
      await api("/api/rules/pending", { method: "POST", json: { action: "drop", by: "shopper" } });
      setSaved("You withdrew the change. Your current rules stay as they are.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const hasQuestions = (parsed?.questions.length ?? 0) > 0;

  return (
    <div className="max-w-4xl space-y-12">
      <PageTitle
        lead={`You decide when ${reviewer} takes a look. A stricter rule works right away. If you loosen one, ${reviewer} is told, and it starts after 24 hours unless ${reviewer} says yes sooner.`}
      >
        My rules
      </PageTitle>

      {saved && <Notice tone="ledger">{saved}</Notice>}

      {pending && (
        <Notice tone="signal" title="A change is waiting">
          <p>
            You loosened a safeguard. {reviewer} has been told.{" "}
            {pending.autoActivateAt
              ? `It starts on its own ${new Date(pending.autoActivateAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}, or sooner if ${reviewer} says yes.`
              : `It starts when ${reviewer} says yes.`}{" "}
            Until then, the stricter of your old and new rules applies.
          </p>
          <div className="mt-3">
            <Button tone="quiet" onClick={withdraw} disabled={busy !== null}>
              Withdraw the change
            </Button>
          </div>
        </Notice>
      )}

      <section aria-labelledby="current">
        <h2 id="current" className="mb-4 text-2xl font-bold">
          {pending ? "Rules in force right now" : "Your rules"}
        </h2>
        <RulesTable rules={session.active} reviewer={reviewer} />
      </section>

      <section aria-labelledby="change" className="space-y-4">
        <h2 id="change" className="text-2xl font-bold">
          Change your rules
        </h2>
        <p className="text-ink-soft">Write it the way you&apos;d say it. You&apos;ll see exactly what we understood before anything changes.</p>
        <label htmlFor="rules-text" className="sr-only">
          Your rules in your own words
        </label>
        <textarea
          id="rules-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={EXAMPLE}
          className="w-full rounded-xl border-2 border-line px-5 py-4 text-xl placeholder:text-ink-soft/60 focus:border-relay focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button onClick={read} disabled={busy !== null || text.trim().length < 3}>
            {busy === "read" ? "Reading…" : "Check what I wrote"}
          </Button>
          <button type="button" onClick={() => setText(EXAMPLE)} className="text-lg font-semibold text-relay underline-offset-4 hover:underline">
            Use the example
          </button>
          <label className="flex items-center gap-3 text-lg">
            <input type="checkbox" checked={startFresh} onChange={(e) => setStartFresh(e.target.checked)} className="size-6 accent-relay" />
            Replace all my rules with this
          </label>
        </div>
        <ErrorNotice error={error} />

        {parsed && (
          <div className="space-y-6 rounded-2xl border-2 border-line p-6">
            <div>
              <h3 className="text-xl font-bold">Here&apos;s what we understood</h3>
              <p className="mt-1">{parsed.summary}</p>
            </div>

            {hasQuestions && (
              <Notice tone="signal" title="Please answer before saving">
                <ul className="list-disc space-y-1 pl-5">
                  {parsed.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="mt-2">Add the answer to what you wrote above, then check it again.</p>
              </Notice>
            )}
            {parsed.unclear.length > 0 && (
              <Notice tone="relay" title="We weren't sure about this part, so we left it out">
                <ul className="list-disc pl-5">
                  {parsed.unclear.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </Notice>
            )}

            <RulesTable rules={parsed.rules} reviewer={reviewer} caption="Your rules after this change" />

            <div className="flex flex-wrap gap-3">
              <Button tone="ledger" onClick={save} disabled={busy !== null || hasQuestions}>
                {busy === "save" ? "Saving…" : "Save these rules"}
              </Button>
              <Button tone="quiet" onClick={() => setParsed(null)} disabled={busy !== null}>
                Not right, start again
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
