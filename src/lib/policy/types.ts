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

/**
 * A category the rule owner made up, like "custom:Cars". The label is part of
 * the key, so it reads correctly anywhere without looking anything up.
 */
export type CustomCategoryKey = `custom:${string}`;
export type CategoryKey = CategoryId | CustomCategoryKey;

const CUSTOM_PREFIX = "custom:";
const BUILT_IN = new Set<string>(CATEGORY_IDS);

export function isCustomCategory(key: string): key is CustomCategoryKey {
  return key.startsWith(CUSTOM_PREFIX) && key.length > CUSTOM_PREFIX.length;
}

export function isCategoryKey(key: string): key is CategoryKey {
  return BUILT_IN.has(key) || (isCustomCategory(key) && key.length <= 48 && !key.slice(CUSTOM_PREFIX.length).includes(":"));
}

/** "cars " -> "custom:Cars". */
export function customCategoryKey(name: string): CustomCategoryKey {
  const clean = name.replace(/[:\s]+/g, " ").trim().slice(0, 40);
  return `custom:${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

export function categoryLabel(key: CategoryKey): string {
  return isCustomCategory(key) ? key.slice(CUSTOM_PREFIX.length) : CATEGORY_LABELS[key];
}

const CategoryKeySchema = z.string().refine(isCategoryKey, "Unknown category");

export const CategoryRuleSchema = z.object({
  bands: z.array(AmountBandSchema),
  /** Who reviews this category, if not the household's main reviewer. */
  reviewer: z.string().trim().min(1).max(40).optional(),
});
export type CategoryRule = z.infer<typeof CategoryRuleSchema>;

export const CAP_PERIODS = ["purchase", "week", "month"] as const;
export type CapPeriod = (typeof CAP_PERIODS)[number];

/**
 * A spending cap on top of the per-category bands. Weeks and months are
 * rolling (the last 7 or 30 days), so there's no reset day to game.
 */
export interface Cap {
  /** null applies the cap to all categories combined. */
  category: CategoryKey | null;
  period: CapPeriod;
  limitCents: number;
  /** What happens to a purchase that would go over. */
  over: Outcome;
}

export const CapSchema = z.object({
  category: CategoryKeySchema.nullable(),
  period: z.enum(CAP_PERIODS),
  limitCents: z.number().int().positive(),
  over: z.enum(OUTCOMES),
}) as unknown as z.ZodType<Cap>;

/** Words that identify a custom category in a store's category or a product title. */
export interface CustomCategory {
  match: string[];
}

export interface RuleSet {
  /** Categories without their own rule fall back to "general". */
  categories: Partial<Record<CategoryKey, CategoryRule>>;
  caps: Cap[];
  custom?: Partial<Record<CustomCategoryKey, CustomCategory>>;
}

export const RuleSetSchema = z.object({
  categories: z.record(z.string(), CategoryRuleSchema).refine((c) => Object.keys(c).every(isCategoryKey), "Unknown category"),
  caps: z.array(CapSchema),
  custom: z
    .record(z.string(), z.object({ match: z.array(z.string().trim().min(2).max(40)).min(1).max(20) }))
    .refine((c) => Object.keys(c).every(isCustomCategory), "Custom categories must start with custom:")
    .optional(),
}) as unknown as z.ZodType<RuleSet>;

export type RecurringFinding = "yes" | "no" | "uncertain";

export type PurchaseStatus = "pending_review" | "authorized" | "captured" | "voided" | "declined";

/** A past or in-flight purchase, used for weekly and monthly totals. */
export interface HistoryEntry {
  at: string; // ISO timestamp
  categories: CategoryKey[];
  amountCents: number;
  status: PurchaseStatus;
}
