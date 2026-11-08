// How an occasion reads on the calendar and in the list.

export interface OccasionView {
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  job: string;
  daysAhead: number;
  shoppedAt: string | null;
  note: string | null;
  purchase: { id: string; state: string; title: string; amountCents: number } | null;
}

export type OccasionTone = "plain" | "due" | "waiting" | "done" | "stop" | "past";

/** The day the AI shops: `daysAhead` days before the date. */
export function shopDay(date: string, daysAhead: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Today in the viewer's own time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function dayWords(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function occasionStatus(o: OccasionView, today: string, owner: string): { words: string; tone: OccasionTone } {
  const p = o.purchase;
  if (p) {
    if (p.state === "completed") return { words: `Bought for ${money(p.amountCents)}`, tone: "done" };
    if (p.state === "declined") return { words: `${owner} said no`, tone: "stop" };
    if (["expired", "canceled", "blocked", "failed"].includes(p.state)) return { words: "Not bought", tone: "stop" };
    return { words: `Waiting for ${owner}`, tone: "waiting" };
  }
  if (o.shoppedAt) return o.note ? { words: "Found nothing to buy", tone: "stop" } : { words: "Shopping now", tone: "waiting" };
  if (o.date < today) return { words: "Date passed", tone: "past" };
  const day = shopDay(o.date, o.daysAhead);
  return day <= today ? { words: "Shops today", tone: "due" } : { words: `Shops ${dayWords(day)}`, tone: "plain" };
}
