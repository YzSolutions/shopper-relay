import { settle, type RuleSet, type RulesState } from "../policy";
import { db } from "../db/client";
import { logEvent, type Actor } from "./events";
import { getRulesState, type Household } from "./households";

// Every rule change is kept, with the rules before and after, so both people can
// see what changed, who changed it and when. Nobody can edit or delete it.

export const RULE_EVENT_TYPES = ["rules_changed", "rules_approved", "rules_change_dropped", "rules_activated"] as const;
export type RuleEventType = (typeof RULE_EVENT_TYPES)[number];

export interface RuleChangeDetail {
  before: RuleSet;
  after: RuleSet;
  /** Whether "after" is in force now, waits, or never took effect. */
  status: "applied" | "waiting" | "dropped";
}

export interface RuleHistoryEntry {
  id: number;
  at: string;
  type: RuleEventType;
  actor: Actor;
  message: string;
  change: RuleChangeDetail | null;
}

export async function logRuleEvent(householdId: string, e: { type: RuleEventType; actor: Actor; message: string; change: RuleChangeDetail }) {
  await logEvent({ householdId, type: e.type, actor: e.actor, message: e.message, detail: e.change });
}

/**
 * The rules state with any waiting change that has come due applied and saved.
 * Only the request that actually applies it writes the history line, so two
 * pages loading at once don't record it twice.
 */
export async function currentRulesState(household: Household, now = new Date()): Promise<RulesState> {
  const stored = await getRulesState(household.id);
  const state = settle(stored, now);
  if (state === stored || !stored.pending) return state;
  const applied = await db()`
    update rules_states set rules = ${JSON.stringify(state.rules)}::jsonb, pending = null, updated_at = now()
    where household_id = ${household.id} and pending is not null
    returning household_id`;
  if (applied.length) {
    const who = stored.pending.requestedBy === "shopper" ? household.shopperName : household.reviewerName;
    await logRuleEvent(household.id, {
      type: "rules_activated",
      actor: "system",
      message: `${who}'s rule change started: the 24 hours passed.`,
      change: { before: stored.rules, after: state.rules, status: "applied" },
    });
  }
  return state;
}

type Row = { id: string; at: string; type: RuleEventType; actor: Actor; message: string; detail: unknown };

const isChange = (d: unknown): d is RuleChangeDetail => typeof d === "object" && d !== null && "before" in d && "after" in d;

/** Rule changes, newest first. */
export async function ruleHistory(householdId: string, limit = 50): Promise<RuleHistoryEntry[]> {
  const rows = (await db()`
    select id, at, type, actor, message, detail from events
    where household_id = ${householdId} and type = any(${RULE_EVENT_TYPES as unknown as string[]})
    order by at desc, id desc limit ${limit}`) as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    type: r.type,
    actor: r.actor,
    message: r.message,
    change: isChange(r.detail) ? r.detail : null,
  }));
}
