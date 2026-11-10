import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Outcome } from "@/lib/policy";
import { categoryLabel, type CategoryKey } from "@/lib/policy/types";

// Small, shared pieces. Buttons are large on purpose (at least 52px tall).

type Tone = "relay" | "ledger" | "quiet" | "stop";

const BUTTON: Record<Tone, string> = {
  relay: "bg-relay text-white hover:bg-relay-deep",
  ledger: "bg-ledger text-white hover:bg-ledger-deep",
  quiet: "bg-white text-ink border-2 border-line hover:border-ink-soft",
  stop: "bg-white text-stop border-2 border-stop/40 hover:border-stop",
};

const buttonClass = (tone: Tone, extra = "") =>
  `inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-6 py-3 text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[tone]} ${extra}`;

export function Button({ tone = "relay", className = "", ...props }: ComponentProps<"button"> & { tone?: Tone }) {
  return <button className={buttonClass(tone, className)} {...props} />;
}

export function ButtonLink({ tone = "relay", className = "", ...props }: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link className={buttonClass(tone, className)} {...props} />;
}

/** A button-styled link to another site, opened in a new tab. */
export function ButtonAnchor({ tone = "relay", className = "", ...props }: ComponentProps<"a"> & { tone?: Tone }) {
  return <a className={buttonClass(tone, className)} target="_blank" rel="noopener noreferrer" {...props} />;
}

export function Money({ cents, currency = "USD", className = "" }: { cents: number; currency?: string; className?: string }) {
  const text = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}

/** What happens if the shopper goes ahead, said to the shopper. */
/** `standing`: request flow only, whether the payer's standing permission is on. */
export function outcomeText(outcome: Outcome, reviewer: string, flow: "hold" | "request" = "hold", standing = false): string {
  switch (outcome) {
    case "auto":
      // Without the payer's saved PayPal the rule can't work yet; say so, or it looks broken.
      return flow === "hold" ? "You can buy this yourself" : standing ? `You can buy this; ${reviewer}'s saved PayPal pays` : `${reviewer} decides until ${reviewer}'s PayPal is saved`;
    case "review":
      return flow === "hold" ? `${reviewer} takes a look first` : `${reviewer} decides`;
    case "exception":
      return flow === "hold" ? `Over your limit, so ${reviewer} decides` : `Over budget, so ${reviewer} decides`;
    case "blocked":
      return flow === "hold" ? "Not allowed by your rules" : "Not allowed";
  }
}

const OUTCOME_STYLE: Record<Outcome, { dot: string; text: string }> = {
  auto: { dot: "bg-ledger", text: "text-ledger" },
  review: { dot: "bg-signal", text: "text-signal-text" },
  exception: { dot: "bg-signal", text: "text-signal-text" },
  blocked: { dot: "bg-stop", text: "text-stop" },
};

export function OutcomeLine({
  outcome,
  reviewer,
  flow = "hold",
  text,
  standing = false,
  className = "",
}: {
  outcome: Outcome;
  reviewer: string;
  flow?: "hold" | "request";
  text?: string;
  /** Request flow: the payer's standing permission is on. */
  standing?: boolean;
  className?: string;
}) {
  // In the request flow the reviewer decides, so only "over budget", "not allowed" and,
  // with standing permission, "you can buy this" stand out.
  const plain = flow === "request" && outcome !== "exception" && outcome !== "blocked" && !(outcome === "auto" && standing);
  const s = plain ? { dot: "bg-relay", text: "text-relay-deep" } : OUTCOME_STYLE[outcome];
  return (
    <p className={`flex items-center gap-2.5 font-semibold ${s.text} ${className}`}>
      <span aria-hidden className={`size-3 shrink-0 rounded-full ${s.dot}`} />
      {text ?? outcomeText(outcome, reviewer, flow, standing)}
    </p>
  );
}

/** Weekly and monthly budgets: what's paid, what's reserved by open requests, and what's left. */
export function BudgetBars({ lines, title }: { lines: Array<{ label: string; period: "week" | "month"; limitCents: number; spentCents: number; reservedCents: number; leftCents: number }>; title?: string }) {
  if (!lines.length) return null;
  const pct = (n: number, of: number) => `${Math.min(100, (n / of) * 100)}%`;
  return (
    <div className="space-y-3">
      {title && <p className="font-bold">{title}</p>}
      {lines.map((l) => (
        <div key={`${l.label}${l.period}`}>
          <p className="flex flex-wrap justify-between gap-x-4">
            <span>
              {l.label}, {l.period === "week" ? "last 7 days" : "last 30 days"}
            </span>
            <span className="font-semibold">
              <Money cents={l.leftCents} /> left of <Money cents={l.limitCents} />
            </span>
          </p>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="bg-ledger" style={{ width: pct(l.spentCents, l.limitCents) }} />
            <div className="bg-signal/70" style={{ width: pct(l.reservedCents, l.limitCents) }} />
          </div>
          {l.reservedCents > 0 && (
            <p className="mt-1 text-base text-ink-soft">
              <Money cents={l.reservedCents} /> is set aside for requests still waiting.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function CountedAs({ category }: { category: CategoryKey }) {
  return (
    <span className="text-ink-soft">
      Counted as <span className="font-semibold text-ink">{categoryLabel(category)}</span>
    </span>
  );
}

export function Notice({ tone = "relay", title, children }: { tone?: "relay" | "ledger" | "signal" | "stop"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    relay: "border-relay bg-relay-wash",
    ledger: "border-ledger bg-ledger-wash",
    signal: "border-signal bg-signal-wash",
    stop: "border-stop bg-stop-wash",
  }[tone];
  return (
    <div className={`rounded-r-xl border-l-[6px] px-5 py-4 ${styles}`} role={tone === "stop" ? "alert" : undefined}>
      {title && <p className="text-lg font-bold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function ErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return <Notice tone="stop">{error}</Notice>;
}

export function PageTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-[2.125rem] font-extrabold sm:text-[2.5rem]">{children}</h1>
      {lead && <p className="mt-3 max-w-[38rem] text-xl text-ink-soft">{lead}</p>}
    </header>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-3 text-ink-soft" role="status">
      <span aria-hidden className="size-5 animate-spin rounded-full border-[3px] border-line border-t-relay" />
      {label}
    </span>
  );
}
