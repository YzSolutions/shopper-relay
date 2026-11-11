"use client";

import { useState } from "react";
import { RuleHistory } from "@/components/RuleHistory";
import { RulesTable } from "@/components/RulesTable";
import { Button, ErrorNotice, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, ApiError, type ParsedRules } from "@/lib/client/api";
import { changeWords, summarizeChange } from "@/lib/policy/changes";
import { usePolling } from "@/lib/client/usePolling";
import { useSession } from "@/lib/client/useSession";

const EXAMPLES: Record<string, string> = {
  ai_shopper: "The AI shopper can buy desk clocks under $25 without asking. No more than $500 a week.",
  family_elder:
    "I can buy clothes under $200 and medical devices under $100 on my own. Anything else under $150. Above that, Sarah takes a look. Any subscription goes to Sarah. Video games go to Marcus.",
  parent_child: "Leo can ask for toys up to $15 and books up to $20. Anything over that is an exception. No more than $30 a week. Video games go to Marcus.",
  personal_shopper: "Clothing budget $200, shoes and handbags $150, electronics $400. Anything over budget is an exception. Watches budget $300.",
};

export default function RulesPage() {
  const { session, error: loadError, reload } = useSession();
  const [text, setText] = useState("");
  const [startFresh, setStartFresh] = useState(false);
  const [parsed, setParsed] = useState<ParsedRules | null>(null);
  const [busy, setBusy] = useState<"read" | "save" | "pending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // While a change waits, the reviewer can delay or approve it from their phone; show that here without a reload.
  usePolling(reload, 3000, !!session?.pending);

  if (!session) return loadError ? <ErrorNotice error={loadError} /> : <Spinner label="Loading your rules…" />;
  const reviewer = session.household.reviewerName;
  const shopper = session.household.shopperName;
  const pending = session.pending;
  const flow = session.relationship.flow;
  // Whose rules: Mom's own, or the parent's / customer's (the shopper can only ask).
  const shopperOwns = session.owner === "shopper";
  // Where the reviewer pays, "you buy" rows need the payer's standing permission to work.
  const buysOwn = Object.values(session.active.categories).some((r) => r?.bands.some((b) => b.outcome === "auto"));
  const needsStanding = session.relationship.payer === "reviewer" && buysOwn && !session.standing;
  const EXAMPLE = EXAMPLES[session.household.relationship] ?? EXAMPLES.family_elder;

  async function read() {
    setBusy("read");
    setError(null);
    setSaved(null);
    try {
      setParsed(await api<ParsedRules>("/api/rules/parse", { method: "POST", json: { text, startFresh, householdId: session?.household.id } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(by: "shopper" | "reviewer") {
    if (!parsed) return;
    setBusy("save");
    setError(null);
    try {
      const res = await api<{ message: string }>("/api/rules", { method: "POST", json: { rules: parsed.rules, by, householdId: session?.household.id } });
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
      await api("/api/rules/pending", { method: "POST", json: { action: "drop", by: pending?.requestedBy ?? "shopper", householdId: session?.household.id } });
      setSaved("The change was withdrawn. The current rules stay as they are.");
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
        lead={
          shopper === reviewer
            ? "Your own limits, for your own money. Changes apply right away."
            : shopperOwns
            ? `You decide when ${reviewer} takes a look. A stricter rule works right away. If you loosen one, or change who reviews something, ${reviewer} is told, and it starts after 24 hours unless ${reviewer} says yes sooner.`
            : `${reviewer} sets these rules for ${shopper}. ${reviewer}'s changes apply right away. ${shopper} can ask for a looser rule, which waits for ${reviewer}; a stricter one applies right away.`
        }
      >
        {shopperOwns ? "My rules" : `${reviewer}'s rules for ${shopper}`}
      </PageTitle>

      {saved && <Notice tone="ledger">{saved}</Notice>}

      {pending && (
        <Notice tone="signal" title="A change is waiting">
          <p>
            {shopperOwns
              ? `You ${changeWords(summarizeChange(session.rules, pending.proposed))}.`
              : `${shopper} asked to ${changeWords(summarizeChange(session.rules, pending.proposed), "ask")}.`}{" "}
            {reviewer} has been told.{" "}
            {pending.delayedAt && `${reviewer} asked for 3 days to talk it over. `}
            {pending.autoActivateAt
              ? `It starts on its own ${new Date(pending.autoActivateAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}, or sooner if ${reviewer} says yes.`
              : `It starts when ${reviewer} says yes.`}{" "}
            Until then, the stricter of the old and new rules applies.
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
          {pending ? "Rules in force right now" : shopperOwns ? "Your rules" : "The rules"}
        </h2>
        <RulesTable rules={session.active} reviewer={reviewer} flow={flow} />
        {needsStanding && (
          <div className="mt-4">
            <Notice tone="signal" title={`Waiting for ${reviewer}'s standing permission`}>
              Rows that say &ldquo;You buy, {reviewer} pays&rdquo; start working once {reviewer} saves a PayPal account for it on {reviewer}&apos;s phone. Until then,{" "}
              {reviewer} decides.
            </Notice>
          </div>
        )}
        {session.relationship.payer === "reviewer" && session.standing && buysOwn && (
          <p className="mt-3 text-base text-ink-soft">
            {reviewer}&apos;s standing permission is on, so &ldquo;You buy, {reviewer} pays&rdquo; rows work now.
          </p>
        )}
      </section>

      <section aria-labelledby="change" className="space-y-4">
        <h2 id="change" className="text-2xl font-bold">
          {shopperOwns ? "Change your rules" : "Change the rules"}
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
            Replace all the rules with this
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

            <RulesTable rules={parsed.rules} reviewer={reviewer} flow={flow} caption="The rules after this change" />

            <div className="flex flex-wrap gap-3">
              {shopperOwns ? (
                <Button tone="ledger" onClick={() => save("shopper")} disabled={busy !== null || hasQuestions}>
                  {busy === "save" ? "Saving…" : "Save these rules"}
                </Button>
              ) : (
                <>
                  <Button tone="ledger" onClick={() => save("reviewer")} disabled={busy !== null || hasQuestions}>
                    {busy === "save" ? "Saving…" : `Demo: save as ${reviewer}`}
                  </Button>
                  <Button onClick={() => save("shopper")} disabled={busy !== null || hasQuestions}>
                    {`Ask ${reviewer} (as ${shopper})`}
                  </Button>
                </>
              )}
              <Button tone="quiet" onClick={() => setParsed(null)} disabled={busy !== null}>
                Not right, start again
              </Button>
            </div>
            {!shopperOwns && (
              <p className="text-base text-ink-soft">
                In a real setup only {reviewer} could save these. The demo lets you act as either person.
              </p>
            )}
          </div>
        )}
      </section>

      <RuleHistory refresh={session} reviewer={reviewer} flow={flow} />
    </div>
  );
}
