// All money in the app is integer cents. Floats never touch a payment decision.

/** Parse a decimal string like "179.00" or "9.5" (as PayPal and catalogs send it) into cents. */
export function parseToCents(value: string): number {
  const match = /^\s*(-)?(\d+)(?:\.(\d{1,2}))?\s*$/.exec(value);
  if (!match) throw new Error(`Not a money amount: "${value}"`);
  const [, minus, whole, frac = ""] = match;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return minus ? -cents : cents;
}

/** Cents to the decimal string PayPal expects, e.g. 17900 -> "179.00". */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
