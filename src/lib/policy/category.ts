import type { CategoryId, RecurringFinding } from "./types";

/**
 * Catalog taxonomy -> our categories. Order matters: first match wins, so the
 * more specific (and usually stricter) categories come first.
 */
const CATALOG_PATTERNS: Array<[RegExp, CategoryId]> = [
  [/blood pressure|biometric monitor|medical (device|suppl)|glucose|pulse oximeter|thermometer|hearing aid|mobility aid|health care/i, "medical_device"],
  [/apparel|clothing|outerwear|coat|jacket|shoe|footwear|dress|pants|shirt|sweater/i, "clothing"],
  [/grocer|food|beverage|snack|pantry/i, "food"],
];

/** AI answers below this confidence never decide a category on their own. */
export const AI_CONFIDENCE_FLOOR = 0.8;

export interface CategoryEvidence {
  /** Taxonomy path from the product source, e.g. Channel3's category.path. */
  catalogPath?: string[] | null;
  /** The model's guess, used only when the catalog is silent. */
  ai?: { category: CategoryId; confidence: number } | null;
  recurring: RecurringFinding;
}

export interface CategoryResolution {
  /** Every category whose rule applies; the policy engine takes the strictest. */
  categories: CategoryId[];
  /** The one shown to the owner as "Counted as". */
  primary: CategoryId;
  basis: "catalog" | "ai" | "ambiguous";
  note: string;
}

export function categoryFromCatalog(path: string[] | null | undefined): CategoryId | null {
  if (!path?.length) return null;
  const text = path.join(" > ");
  return CATALOG_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null;
}

/**
 * Decide which spending rules a purchase falls under. The catalog wins when it
 * is clear; the AI only fills in when it is not, and any doubt widens the set
 * of categories so the stricter rule applies rather than the looser one.
 */
export function resolveCategory(evidence: CategoryEvidence): CategoryResolution {
  const fromCatalog = categoryFromCatalog(evidence.catalogPath);
  const ai = evidence.ai ?? null;
  const confidentAi = ai && ai.confidence >= AI_CONFIDENCE_FLOOR ? ai.category : null;

  let resolution: CategoryResolution;
  if (fromCatalog && (!confidentAi || confidentAi === fromCatalog)) {
    resolution = { categories: [fromCatalog], primary: fromCatalog, basis: "catalog", note: "From the store's product category." };
  } else if (fromCatalog && confidentAi) {
    resolution = {
      categories: [fromCatalog, confidentAi],
      primary: fromCatalog,
      basis: "ambiguous",
      note: "The store's category and the AI's reading disagree, so the stricter rule applies.",
    };
  } else if (confidentAi) {
    resolution = { categories: [confidentAi], primary: confidentAi, basis: "ai", note: "The store gave no category, so the AI classified it." };
  } else {
    const guess = ai?.category ?? "general";
    resolution = {
      categories: [...new Set<CategoryId>([guess, "general"])],
      primary: guess,
      basis: "ambiguous",
      note: "The category is unclear, so the stricter rule applies.",
    };
  }

  // Anything that is or might be recurring is also held to the subscription rule.
  if (evidence.recurring !== "no" && !resolution.categories.includes("subscription")) {
    resolution.categories.push("subscription");
    resolution.note +=
      evidence.recurring === "yes"
        ? " It includes a recurring charge, so the subscription rule applies too."
        : " It may include a recurring charge, so the subscription rule applies too.";
  }
  return resolution;
}
