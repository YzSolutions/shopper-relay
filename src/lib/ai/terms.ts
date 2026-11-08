// "Check Before You Buy": read a checkout screenshot and pull out what the
// person is really agreeing to. Doubt about a recurring charge is treated as
// a recurring charge.

import { z } from "zod";
import { numberToCents } from "../money";
import type { RecurringFinding } from "../policy";
import { generateJson } from "./gemini";

const AiTermsSchema = z.object({
  readable: z.boolean().describe("false if the image is not a readable purchase or checkout page"),
  productName: z.string().nullable(),
  seller: z.string().nullable(),
  itemPriceDollars: z.number().nullable(),
  shippingDollars: z.number().nullable(),
  taxDollars: z.number().nullable(),
  totalDueTodayDollars: z.number().nullable(),
  recurring: z.object({
    found: z.enum(["yes", "no", "uncertain"]),
    amountDollars: z.number().nullable(),
    interval: z.enum(["week", "month", "year", "other"]).nullable(),
    startsWhen: z.string().nullable().describe('e.g. "after a 30-day trial"'),
    evidence: z.array(z.string()).describe("exact words from the image that mention the recurring charge"),
  }),
  trial: z.string().nullable(),
  cancellation: z.string().nullable(),
  returns: z.string().nullable(),
  otherImportantTerms: z.array(z.string()),
  plainSummary: z.string().describe("two or three short sentences for the buyer"),
});
export type AiTerms = z.infer<typeof AiTermsSchema>;

const SYSTEM = `You read a screenshot of a product or checkout page for someone about to buy, and report what they would actually be paying and agreeing to.

- Only report what is written in the image. Never guess a price or a term that isn't shown.
- Look closely at small print: trials, memberships, "auto-renews", "billed monthly", "cancel anytime", subscribe-and-save, protection plans and add-ons.
- recurring.found is "yes" if any repeating charge is mentioned, "no" only if the page clearly shows a one-time purchase with nothing recurring, and "uncertain" otherwise.
- Quote the exact words in recurring.evidence.
- Write plainSummary in short, simple sentences. Say "No recurring charge is listed" rather than claiming there is none.
- Do not give medical, legal or financial advice, and do not judge whether the purchase is a good idea.`;

export interface CheckoutTerms {
  raw: AiTerms;
  /** Conservative reading for the policy engine. */
  recurring: RecurringFinding;
  totalDueTodayCents: number | null;
  recurringCents: number | null;
  model: string;
}

/** Words that suggest a repeating charge, checked by code rather than trusted from the model. */
export const RECURRING_WORDS = /renew|recurr|subscri|membership|per month|\/\s?mo|monthly|weekly|annual|yearly|per year|billed every|auto-?ship|trial/i;

/**
 * Policy-facing reading: anything short of a clear "no" counts as possibly
 * recurring. A "no" is overruled if any extracted text mentions one.
 */
export function recurringFinding(t: AiTerms): RecurringFinding {
  if (!t.readable) return "uncertain";
  if (t.recurring.found !== "no") return t.recurring.found;
  const text = [...t.recurring.evidence, t.trial, t.cancellation, ...t.otherImportantTerms].filter(Boolean).join(" ");
  return RECURRING_WORDS.test(text) ? "uncertain" : "no";
}

export async function readCheckoutScreenshot(image: { base64: string; mimeType: string }): Promise<CheckoutTerms> {
  const { data, model } = await generateJson({
    task: "read-checkout",
    schema: AiTermsSchema,
    system: SYSTEM,
    parts: [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }, { text: "What would I be paying and agreeing to?" }],
  });
  return {
    raw: data,
    recurring: recurringFinding(data),
    totalDueTodayCents: data.totalDueTodayDollars === null ? null : numberToCents(data.totalDueTodayDollars),
    recurringCents: data.recurring.amountDollars === null ? null : numberToCents(data.recurring.amountDollars),
    model,
  };
}
