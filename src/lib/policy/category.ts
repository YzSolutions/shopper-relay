import { categoryLabel, type CategoryId, type CategoryKey, type CustomCategoryKey, type RecurringFinding, type RuleSet } from "./types";

/**
 * Catalog taxonomy -> our categories. Order matters: first match wins, so the
 * more specific (and usually stricter) categories come first.
 */
const CATALOG_PATTERNS: Array<[RegExp, CategoryId]> = [
  // Gadgets some stores file under jewelry, health care or books.
  [/smart ?watch|activity monitor|fitness tracker|e-?book reader|e-?reader/i, "electronics"],
  [/blood pressure|biometric monitor|medical (device|suppl)|glucose|pulse oximeter|thermometer|hearing aid|mobility aid|health care/i, "medical_device"],
  // Before electronics, but only for games and consoles: a "gaming PC" is a computer.
  [/video game|game console|game controller/i, "video_games"],
  [/shoe|footwear|sneaker|boot|handbag|purse|wallet/i, "shoes_handbags"],
  [/apparel|clothing|outerwear|coat|jacket|dress|pants|shirt|sweater/i, "clothing"],
  [/toy|puzzle|board game|doll|action figure/i, "toys"],
  [/school suppl|office suppl|notebook|backpack|stationery/i, "school_supplies"],
  [/\bbooks?\b/i, "books"],
  [/collectible|trading card|memorabilia/i, "collectibles"],
  [/electronic|computer|phone|tablet|audio|headphone|camera/i, "electronics"],
  [/home ?(&|and) ?garden|decor|furniture|lighting|bedding/i, "home_decor"],
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
  /** The product title, checked against the owner's custom categories. */
  title?: string | null;
  /** The owner's custom categories and the words that identify them. */
  custom?: RuleSet["custom"];
}

export interface CategoryResolution {
  /** Every category whose rule applies; the policy engine takes the strictest. */
  categories: CategoryKey[];
  /** The one shown as "Counted as". */
  primary: CategoryKey;
  basis: "catalog" | "ai" | "ambiguous" | "custom";
  note: string;
}

function mentions(text: string, word: string): boolean {
  const w = word.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return w.length > 1 && new RegExp(`\\b${w}(s|es)?\\b`, "i").test(text);
}

/** Custom categories whose words appear in the text. */
export function customMatches(text: string | null | undefined, custom: RuleSet["custom"]): CustomCategoryKey[] {
  if (!text || !custom) return [];
  return (Object.entries(custom) as Array<[CustomCategoryKey, { match: string[] }]>)
    .filter(([, c]) => c.match.some((w) => mentions(text, w)))
    .map(([key]) => key);
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

  // The owner's own categories. If the store files it there, that's what it is.
  // If only the title mentions it ("car phone mount"), its rule is added and
  // the stricter one wins, so a custom category can't become a loophole.
  const inCatalog = customMatches(evidence.catalogPath?.join(" > "), evidence.custom);
  const inTitle = customMatches(evidence.title, evidence.custom).filter((k) => !inCatalog.includes(k));
  if (inCatalog.length) {
    resolution = {
      categories: [...inCatalog],
      primary: inCatalog[0],
      basis: "custom",
      note: `The store files it under ${categoryLabel(inCatalog[0])}, one of your own categories.`,
    };
  }
  if (inTitle.length) {
    resolution.categories.push(...inTitle);
    if (resolution.basis !== "custom") {
      resolution.note += ` Its name mentions ${inTitle.map(categoryLabel).join(" and ")}, so that rule is checked too and the stricter one applies.`;
    }
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
