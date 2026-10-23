// Browser-side calls to our own API. Types come from the server code, so the
// two can't drift apart.

import type { RELATIONSHIPS } from "@/config/relationships";
import type { Product } from "@/lib/catalog/types";
import type { AiTerms } from "@/lib/ai/terms";
import type { CategoryResolution, Decision, RuleIssue, RuleSet, RulesState, RecurringFinding } from "@/lib/policy";
import type { LogEvent } from "@/lib/store/events";
import type { Household } from "@/lib/store/households";
import type { purchaseView } from "@/lib/views";

export type PurchaseView = ReturnType<typeof purchaseView>;
export type { LogEvent, Product, Decision, CategoryResolution, RuleSet, RuleIssue, AiTerms, RecurringFinding };

export interface Session {
  brand: { name: string; tagline: string };
  household: Household;
  relationship: (typeof RELATIONSHIPS)[keyof typeof RELATIONSHIPS];
  rules: RuleSet;
  pending: RulesState["pending"];
  active: RuleSet;
  issues: RuleIssue[];
  paypal: { clientId: string | null; env: "sandbox" | "live" };
}

export interface SearchResult {
  product: Product;
  category: CategoryResolution;
  preview: Decision | null;
  sameProductCount: number;
}

export interface ParsedRules {
  rules: RuleSet;
  update: RuleSet;
  issues: RuleIssue[];
  questions: string[];
  unclear: string[];
  summary: string;
}

export interface CheckResult {
  checkId: string;
  terms: AiTerms;
  recurring: RecurringFinding;
  totalDueTodayCents: number | null;
  recurringCents: number | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.", res.status, data);
  return data as T;
}
