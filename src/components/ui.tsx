import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Outcome } from "@/lib/policy";
import { CATEGORY_LABELS, type CategoryId } from "@/lib/policy/types";

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

export function Money({ cents, currency = "USD", className = "" }: { cents: number; currency?: string; className?: string }) {
  const text = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}

/** What happens if the shopper goes ahead, said to the shopper. */
export function outcomeText(outcome: Outcome, reviewer: string): string {
  switch (outcome) {
    case "auto":
      return "You can buy this yourself";
    case "review":
      return `${reviewer} takes a look first`;
    case "exception":
      return `Over your limit, so ${reviewer} decides`;
    case "blocked":
      return "Not allowed by your rules";
  }
}

const OUTCOME_STYLE: Record<Outcome, { dot: string; text: string }> = {
  auto: { dot: "bg-ledger", text: "text-ledger" },
  review: { dot: "bg-signal", text: "text-signal-text" },
  exception: { dot: "bg-signal", text: "text-signal-text" },
  blocked: { dot: "bg-stop", text: "text-stop" },
};

export function OutcomeLine({ outcome, reviewer, text, className = "" }: { outcome: Outcome; reviewer: string; text?: string; className?: string }) {
  const s = OUTCOME_STYLE[outcome];
  return (
    <p className={`flex items-center gap-2.5 font-semibold ${s.text} ${className}`}>
      <span aria-hidden className={`size-3 shrink-0 rounded-full ${s.dot}`} />
      {text ?? outcomeText(outcome, reviewer)}
    </p>
  );
}

export function CountedAs({ category }: { category: CategoryId }) {
  return (
    <span className="text-ink-soft">
      Counted as <span className="font-semibold text-ink">{CATEGORY_LABELS[category]}</span>
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
