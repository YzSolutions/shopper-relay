import { loosenedRanges, tightenedRanges, type BandIssue } from "./bands";
import { effectiveRule, strictestRuleSet } from "./rules";
import { CATEGORY_IDS, type CategoryId, type RuleSet } from "./types";

/** How long a loosening waits if the trusted contact doesn't approve it sooner. */
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
      weeklyLimit: compareLimits(a.weeklySelfLimitCents, b.weeklySelfLimitCents),
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
  requestedAt: string;
  /** When the change applies on its own if the contact never responds. */
  effectiveAt: string;
  contactApprovedAt: string | null;
}

/** The owner's rules plus any loosening still in its cooling-off period. */
export interface RulesState {
  rules: RuleSet;
  pending: PendingChange | null;
}

/**
 * The owner asks for new rules. Tightening applies at once. Anything that
 * loosens a safeguard waits: the contact is notified and can approve it
 * early, and otherwise it applies by itself after the cooling-off period.
 * The contact can never block the owner's change, only speed it up.
 */
export function requestRuleChange(
  state: RulesState,
  proposed: RuleSet,
  now = new Date(),
): { state: RulesState; summary: ChangeSummary; notifyContact: boolean } {
  const current = settle(state, now).rules;
  const summary = summarizeChange(current, proposed);
  if (summary.kind === "none" || summary.kind === "tighten") {
    return { state: { rules: proposed, pending: null }, summary, notifyContact: false };
  }
  return {
    state: {
      rules: current,
      pending: {
        proposed,
        requestedAt: now.toISOString(),
        effectiveAt: new Date(now.getTime() + COOLING_OFF_MS).toISOString(),
        contactApprovedAt: null,
      },
    },
    summary,
    notifyContact: true,
  };
}

export function approvePendingChange(state: RulesState, now = new Date()): RulesState {
  if (!state.pending) return state;
  return settle({ ...state, pending: { ...state.pending, contactApprovedAt: now.toISOString() } }, now);
}

export function withdrawPendingChange(state: RulesState): RulesState {
  return { rules: state.rules, pending: null };
}

/** Apply a pending change once it's approved or its time has come. */
export function settle(state: RulesState, now = new Date()): RulesState {
  const p = state.pending;
  if (p && (p.contactApprovedAt !== null || now.getTime() >= Date.parse(p.effectiveAt))) {
    return { rules: p.proposed, pending: null };
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
