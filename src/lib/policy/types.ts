import { z } from "zod";

/**
 * Every category any preset can use. A preset only defines rules for the ones
 * it cares about; the rest fall back to General Shopping.
 */
export const CATEGORY_IDS = [
  "general",
  "food",
  "clothing",
  "shoes_handbags",
  "medical_device",
  "medical_visit",
  "toys",
  "video_games",
  "books",
  "school_supplies",
  "electronics",
  "gifts",
  "home_decor",
  "collectibles",
  "subscription",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  general: "General Shopping",
  food: "Food & Groceries",
  clothing: "Clothing",
  shoes_handbags: "Shoes & Handbags",
  medical_device: "Medical Devices",
  medical_visit: "Medical Visits",
  toys: "Toys",
  video_games: "Video Games & Accessories",
  books: "Books",
  school_supplies: "School Supplies",
  electronics: "Electronics",
  gifts: "Gifts",
  home_decor: "Home & Décor",
  collectibles: "Collectibles",
  subscription: "Subscriptions",
};

/** The two people in every relationship. */
export type Role = "shopper" | "reviewer";

/**
 * What happens to a purchase, least to most restrictive:
 * - auto: the shopper may buy without anyone else signing off
 * - review: the reviewer approves or declines
 * - exception: over a limit; the reviewer must knowingly approve an exception
 * - blocked: not allowed at all until the rules change
 */
export const OUTCOMES = ["auto", "review", "exception", "blocked"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const AmountBandSchema = z.object({
  /** Inclusive lower bound in cents. */
  minCents: z.number().int().nonnegative(),
  /** Exclusive upper bound in cents; null means "and up". */
  maxCents: z.number().int().positive().nullable(),
  outcome: z.enum(OUTCOMES),
});
export type AmountBand = z.infer<typeof AmountBandSchema>;

export const CategoryRuleSchema = z.object({
  bands: z.array(AmountBandSchema),
});
export type CategoryRule = z.infer<typeof CategoryRuleSchema>;

export const CAP_PERIODS = ["purchase", "week", "month"] as const;
export type CapPeriod = (typeof CAP_PERIODS)[number];

/**
 * A spending cap on top of the per-category bands. Weeks and months are
 * rolling (the last 7 or 30 days), so there's no reset day to game.
 */
export const CapSchema = z.object({
  /** null applies the cap to all categories combined. */
  category: z.enum(CATEGORY_IDS).nullable(),
  period: z.enum(CAP_PERIODS),
  limitCents: z.number().int().positive(),
  /** What happens to a purchase that would go over. */
  over: z.enum(OUTCOMES),
});
export type Cap = z.infer<typeof CapSchema>;

export const RuleSetSchema = z.object({
  /** Categories without their own rule fall back to "general". */
  categories: z.partialRecord(z.enum(CATEGORY_IDS), CategoryRuleSchema),
  caps: z.array(CapSchema),
});
export type RuleSet = z.infer<typeof RuleSetSchema>;

export type RecurringFinding = "yes" | "no" | "uncertain";

export type PurchaseStatus = "pending_review" | "authorized" | "captured" | "voided" | "declined";

/** A past or in-flight purchase, used for weekly and monthly totals. */
export interface HistoryEntry {
  at: string; // ISO timestamp
  categories: CategoryId[];
  amountCents: number;
  status: PurchaseStatus;
}
