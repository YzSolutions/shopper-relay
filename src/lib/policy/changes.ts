import { loosenedRanges, tightenedRanges, type BandIssue } from "./bands";
import { effectiveRule, strictestRuleSet } from "./rules";
import { CATEGORY_IDS, type Approver, type CategoryId, type RuleSet } from "./types";

/** How long a shopper's loosening waits if the reviewer doesn't approve it sooner. */
export const COOLING_OFF_MS = 24 * 60 * 60 * 1000;

export interface CategoryChange {
  category: CategoryId;
  loosened: BandIssue[];
  tightened: BandIssue[];
  weeklyLimit: "loosened" | "tightened" | "same";
}

export interface ChangeSummary {
  kind: "none" | "tighten" | "loosen" | "mixed";
  changes: CategoryChange[];
}

function compareLimits(prev: number | null, next: number | null): CategoryChange["weeklyLimit"] {
  if (prev === next) return "same";
  if (next === null) return "loosened"; // limit removed
  if (prev === null) return "tightened"; // limit added
  return next > prev ? "loosened" : "tightened";
}

/** Compare two rule sets by what each one actually allows, category by category. */
export function summarizeChange(prev: RuleSet, next: RuleSet): ChangeSummary {
  const changes: CategoryChange[] = [];
  for (const category of CATEGORY_IDS) {
    const a = effectiveRule(prev, category);
    const b = effectiveRule(next, category);
    const change: CategoryChange = {
      category,
      loosened: loosenedRanges(a.bands, b.bands),
      tightened: tightenedRanges(a.bands, b.bands),
      weeklyLimit: compareLimits(a.weeklyShopperLimitCents, b.weeklyShopperLimitCents),
    };
    if (change.loosened.length || change.tightened.length || change.weeklyLimit !== "same") changes.push(change);
  }
  const loosens = changes.some((c) => c.loosened.length || c.weeklyLimit === "loosened");
  const tightens = changes.some((c) => c.tightened.length || c.weeklyLimit === "tightened");
  const kind = loosens && tightens ? "mixed" : loosens ? "loosen" : tightens ? "tighten" : "none";
  return { kind, changes };
}

export interface PendingChange {
  proposed: RuleSet;
  requestedBy: Approver;
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
   * what their personal shopper may buy without asking.
   */
  owner: Approver;
  rules: RuleSet;
  pending: PendingChange | null;
}

export type ChangeResult =
  | { ok: true; state: RulesState; summary: ChangeSummary; notify: Approver | null }
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
  requestedBy: Approver,
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
