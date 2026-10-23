import { loosenedRanges, tightenedRanges, isStricter, type Range } from "./bands";
import { allCategoryKeys, capKey, effectiveRule, strictestRuleSet } from "./rules";
import { isCustomCategory, type Cap, type CategoryKey, type Role, type RuleSet } from "./types";

/** How long a shopper's loosening waits if the reviewer doesn't approve it sooner. */
export const COOLING_OFF_MS = 24 * 60 * 60 * 1000;

export interface CategoryChange {
  category: CategoryKey;
  loosened: Range[];
  tightened: Range[];
  /** A different person reviews this category. Always treated as loosening. */
  reviewer?: { from: string | null; to: string | null };
  /** More products now count as this (looser-than-general) custom category. */
  widened?: boolean;
}

export interface CapChange {
  key: string;
  direction: "loosened" | "tightened";
}

export interface ChangeSummary {
  kind: "none" | "tighten" | "loosen" | "mixed";
  categories: CategoryChange[];
  caps: CapChange[];
}

/**
 * How one cap changed. Removing a cap or raising its limit loosens; adding one
 * or lowering it tightens. A softer over-limit outcome also loosens.
 */
function compareCap(prev: Cap | undefined, next: Cap | undefined): CapChange["direction"][] {
  if (!prev && !next) return [];
  if (!next) return ["loosened"];
  if (!prev) return ["tightened"];
  const out: CapChange["direction"][] = [];
  if (next.limitCents > prev.limitCents || isStricter(prev.over, next.over)) out.push("loosened");
  if (next.limitCents < prev.limitCents || isStricter(next.over, prev.over)) out.push("tightened");
  return out;
}

/**
 * Whether new match words send more products to a custom category that is
 * looser than General Shopping somewhere: that loosens the rules too.
 */
function widensLooserCategory(prev: RuleSet, next: RuleSet, category: CategoryKey): boolean {
  if (!isCustomCategory(category)) return false;
  const before = new Set((prev.custom?.[category]?.match ?? []).map((w) => w.toLowerCase()));
  const added = (next.custom?.[category]?.match ?? []).some((w) => !before.has(w.toLowerCase()));
  if (!added) return false;
  return loosenedRanges(effectiveRule(next, "general").bands, effectiveRule(next, category).bands).length > 0;
}

/** Compare two rule sets by what each one actually allows. */
export function summarizeChange(prev: RuleSet, next: RuleSet): ChangeSummary {
  const categories: CategoryChange[] = [];
  for (const category of allCategoryKeys(prev, next)) {
    const ra = effectiveRule(prev, category);
    const rb = effectiveRule(next, category);
    const change: CategoryChange = { category, loosened: loosenedRanges(ra.bands, rb.bands), tightened: tightenedRanges(ra.bands, rb.bands) };
    if ((ra.reviewer ?? null) !== (rb.reviewer ?? null)) change.reviewer = { from: ra.reviewer ?? null, to: rb.reviewer ?? null };
    if (widensLooserCategory(prev, next, category)) change.widened = true;
    if (change.loosened.length || change.tightened.length || change.reviewer || change.widened) categories.push(change);
  }

  const prevCaps = new Map(prev.caps.map((c) => [capKey(c), c]));
  const nextCaps = new Map(next.caps.map((c) => [capKey(c), c]));
  const caps: CapChange[] = [...new Set([...prevCaps.keys(), ...nextCaps.keys()])].flatMap((key) =>
    compareCap(prevCaps.get(key), nextCaps.get(key)).map((direction) => ({ key, direction })),
  );

  const loosens = categories.some((c) => c.loosened.length || c.reviewer || c.widened) || caps.some((c) => c.direction === "loosened");
  const tightens = categories.some((c) => c.tightened.length) || caps.some((c) => c.direction === "tightened");
  const kind = loosens && tightens ? "mixed" : loosens ? "loosen" : tightens ? "tighten" : "none";
  return { kind, categories, caps };
}

export interface PendingChange {
  proposed: RuleSet;
  requestedBy: Role;
  requestedAt: string;
  /** When the change applies on its own; null means it waits for approval. */
  autoActivateAt: string | null;
  approvedAt: string | null;
}

/** The current rules plus any loosening that hasn't taken effect yet. */
export interface RulesState {
  /**
   * Whose rules these are. "shopper" for a parent who sets their own
   * safeguards; "reviewer" for a parent of a child, or a customer who sets
   * what their personal shopper may buy.
   */
  owner: Role;
  rules: RuleSet;
  pending: PendingChange | null;
}

export type ChangeResult =
  | { ok: true; state: RulesState; summary: ChangeSummary; notify: Role | null }
  | { ok: false; summary: ChangeSummary; message: string };

/**
 * Someone asks for new rules. Tightening always applies at once. Loosening
 * depends on who asks:
 * - The owner, when the owner is the reviewer: applies at once.
 * - The owner, when the owner is the shopper: the reviewer is notified and
 *   can approve it early; otherwise it applies by itself after the
 *   cooling-off period. The reviewer can speed it up, never block it.
 * - The shopper, when the reviewer owns the rules: waits for the reviewer.
 * The reviewer can't loosen rules the shopper owns.
 */
export function requestRuleChange(
  state: RulesState,
  proposed: RuleSet,
  requestedBy: Role,
  now = new Date(),
): ChangeResult {
  const current = settle(state, now);
  const summary = summarizeChange(current.rules, proposed);
  const isOwner = requestedBy === current.owner;

  if (summary.kind === "none" || summary.kind === "tighten" || (isOwner && current.owner === "reviewer")) {
    return { ok: true, state: { ...current, rules: proposed, pending: null }, summary, notify: null };
  }
  if (!isOwner && requestedBy === "reviewer") {
    return { ok: false, summary, message: "Only the shopper can loosen their own safeguards." };
  }
  const coolingOff = isOwner; // shopper loosening their own rules
  return {
    ok: true,
    state: {
      ...current,
      pending: {
        proposed,
        requestedBy,
        requestedAt: now.toISOString(),
        autoActivateAt: coolingOff ? new Date(now.getTime() + COOLING_OFF_MS).toISOString() : null,
        approvedAt: null,
      },
    },
    summary,
    notify: "reviewer",
  };
}

/** The reviewer approves a pending change, so it applies now. */
export function approvePendingChange(state: RulesState, now = new Date()): RulesState {
  if (!state.pending) return state;
  return settle({ ...state, pending: { ...state.pending, approvedAt: now.toISOString() } }, now);
}

/** The requester withdraws it, or the reviewer turns down a shopper's request. */
export function dropPendingChange(state: RulesState): RulesState {
  return { ...state, pending: null };
}

/** Apply a pending change once it's approved or its time has come. */
export function settle(state: RulesState, now = new Date()): RulesState {
  const p = state.pending;
  const due = p?.autoActivateAt != null && now.getTime() >= Date.parse(p.autoActivateAt);
  if (p && (p.approvedAt !== null || due)) {
    return { ...state, rules: p.proposed, pending: null };
  }
  return state;
}

/**
 * The rules purchases are checked against right now. While a change waits,
 * its tightening parts already apply and its loosening parts don't yet.
 */
export function activeRules(state: RulesState, now = new Date()): RuleSet {
  const s = settle(state, now);
  return s.pending ? strictestRuleSet(s.rules, s.pending.proposed) : s.rules;
}
