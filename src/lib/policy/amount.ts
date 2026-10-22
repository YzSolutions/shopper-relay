import { formatCents, parseToCents } from "../money";

export type AmountCheck =
  | { ok: true; paypalCents: number }
  | { ok: false; paypalCents: number | null; message: string };

/**
 * PayPal's authorized amount is the only figure that counts. If it differs by
 * even a cent from what the shopper reviewed, stop and re-review.
 */
export function checkPayPalAmount(
  reviewedCents: number,
  paypalAmount: { value: string; currency_code: string },
  currency = "USD",
): AmountCheck {
  if (paypalAmount.currency_code !== currency) {
    return { ok: false, paypalCents: null, message: `PayPal is holding ${paypalAmount.currency_code}, not ${currency}.` };
  }
  const paypalCents = parseToCents(paypalAmount.value);
  if (paypalCents !== reviewedCents) {
    return {
      ok: false,
      paypalCents,
      message: `PayPal is holding ${formatCents(paypalCents)} but the purchase you reviewed was ${formatCents(reviewedCents)}. Nothing will be charged until this is checked again.`,
    };
  }
  return { ok: true, paypalCents };
}
