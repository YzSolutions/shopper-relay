import { z } from "zod";

export const CATEGORY_IDS = [
  "general",
  "clothing",
  "medical_device",
  "subscription",
  "food",
  "medical_visit",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  general: "General Shopping",
  clothing: "Clothing",
  medical_device: "Medical Device",
  subscription: "Subscription",
  food: "Food",
  medical_visit: "Medical Visit",
};

/** Who signs off on a purchase. "shopper" is whoever found the item (Mom, a child, a personal shopper); "reviewer" is who signs off when the rules say so. */
export type Approver = "shopper" | "reviewer";

export const AmountBandSchema = z.object({
  /** Inclusive lower bound in cents. */
  minCents: z.number().int().nonnegative(),
  /** Exclusive upper bound in cents; null means "and up". */
  maxCents: z.number().int().positive().nullable(),
  approver: z.enum(["shopper", "reviewer"]),
});
export type AmountBand = z.infer<typeof AmountBandSchema>;

export const CategoryRuleSchema = z.object({
  bands: z.array(AmountBandSchema),
  /**
   * Rolling 7-day cap on what the shopper can approve alone in this category.
   * Once it would be exceeded, the purchase goes to the reviewer.
   */
  weeklyShopperLimitCents: z.number().int().positive().nullable(),
});
export type CategoryRule = z.infer<typeof CategoryRuleSchema>;

export const RuleSetSchema = z.object({
  /** Categories without their own rule fall back to "general". */
  categories: z.partialRecord(z.enum(CATEGORY_IDS), CategoryRuleSchema),
});
export type RuleSet = z.infer<typeof RuleSetSchema>;

export type RecurringFinding = "yes" | "no" | "uncertain";

export type PurchaseStatus = "pending_review" | "authorized" | "captured" | "voided" | "declined";

/** A past or in-flight purchase, used for weekly totals. */
export interface HistoryEntry {
  at: string; // ISO timestamp
  categories: CategoryId[];
  amountCents: number;
  status: PurchaseStatus;
}
