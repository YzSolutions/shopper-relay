// The AI Shopper setup: given a job in plain words, the AI finds a product and
// tries to get it bought. It goes through the same doors as any shopper:
// within the owner's rules and saved PayPal it buys with standing permission,
// and anything else becomes a request the owner decides on. Code reads the
// rules on every listing, so Gemini can only choose among what they allow.

import { z } from "zod";
import { reasonWords } from "@/config/relationships";
import { generateJson } from "../ai/gemini";
import { searchTerms } from "../ai/search";
import { createChannel3Source } from "../catalog/channel3";
import { bestOffer } from "../catalog/compare";
import type { Product } from "../catalog/types";
import { formatCents } from "../money";
import { activeRules, evaluatePurchase, resolveCategory } from "../policy";
import { logEvent } from "../store/events";
import { getRulesState, type Household } from "../store/households";
import { listPurchases, summarize, type Purchase } from "../store/purchases";
import { getStanding } from "../store/standing";
import { hideNames, type AgentStep } from "./agent";
import { goalVerdict, historyFrom, type GoalVerdict } from "./lifecycle";
import { buyWithStanding, chooseCatalogItem, FlowError, sendRequest } from "./service";

const MAX_TURNS = 4;
const PER_SEARCH = 6;

const Turn = z.object({
  thought: z.string().describe("for the owner to read: one plain sentence, under 25 words, on what you're doing next and why"),
  action: z.enum(["search", "choose", "stop"]),
  query: z.string().describe('for "search": what to type into a store search box; otherwise ""'),
  listing: z.string().describe('for "choose": a listing id, like "L3"; otherwise ""'),
});

interface Listing {
  ref: string;
  sourceId: string;
  title: string;
  merchant: string;
  priceCents: number;
  verdict: GoalVerdict;
  why: string;
}

export async function runGoal(household: Household, goal: string): Promise<{ steps: AgentStep[]; purchase: Purchase | null }> {
  const { shopperName: shopper, reviewerName: owner } = household;
  const [state, purchases, standing] = await Promise.all([getRulesState(household.id), listPurchases(household.id, 200), getStanding(household.id)]);
  const rules = activeRules(state);
  const history = historyFrom(purchases.map(summarize));
  const terms = await searchTerms(goal);
  const catalog = createChannel3Source();

  const seen = new Map<string, Listing>();
  const merchants = new Set<string>();
  const brands = new Set<string>();
  const add = (products: Product[]) => {
    for (const p of products) {
      const offer = bestOffer(p);
      if (!offer || seen.has(p.sourceId)) continue;
      if (p.brand) brands.add(p.brand);
      merchants.add(offer.merchant);
      const category = resolveCategory({ catalogPath: p.categoryPath, title: p.title, custom: rules.custom, recurring: "no" });
      const decision = evaluatePurchase(rules, { amountCents: offer.priceCents, categories: category.categories }, history, reasonWords(household));
      seen.set(p.sourceId, {
        ref: `L${seen.size + 1}`,
        sourceId: p.sourceId,
        title: p.title,
        merchant: offer.merchant,
        priceCents: offer.priceCents,
        verdict: goalVerdict(decision.outcome, !!standing, offer.priceCents, terms.maxPriceCents),
        why: decision.reasons.map((r) => r.message).join(" "),
      });
    }
  };
  const shown = (text: string) => (household.hideBrands ? hideNames(text, merchants, brands) : text);
  const steps: AgentStep[] = [];
  const say = (kind: AgentStep["kind"], text: string) => steps.push({ kind, text: shown(text) });
  const save = async (purchaseId: string | null) => {
    for (const s of steps) await logEvent({ householdId: household.id, purchaseId, type: `agent_goal_${s.kind}`, actor: "agent", message: s.text });
  };

  add(await catalog.search(terms.query, { limit: PER_SEARCH, maxPriceCents: terms.maxPriceCents ?? undefined }).catch(() => []));
  say("searched", `Searched stores for "${terms.query}": ${seen.size} ${seen.size === 1 ? "product" : "products"} found.`);

  const system = `You are ${shopper}, an AI shopper in ShopperRelay, working for ${owner}. ${owner} gave you this job: "${goal}".
- Choose the product that best fits the job. Only choose something that really is what ${owner} asked for.
- ShopperRelay's code has read ${owner}'s rules and marked every listing. CAN BUY means you can buy it now. MUST ASK means ${owner} decides. NOT ALLOWED can't be chosen.
- Among listings that fit, always prefer CAN BUY over MUST ASK, then the lower price.
- MUST ASK is a fine result: choosing it asks ${owner}, so never search just to find a CAN BUY. If anything fits the job, choose it now. Search again only if nothing fits at all.
- CAN BUY and MUST ASK are internal marks. Never write them in "thought" or in a search query.
- If nothing fits after searching, stop and say why.
- You have ${MAX_TURNS} turns. Write "thought" for ${owner}: plain words, no jargon, no listing ids.`;
  const tried: string[] = [];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const last = turn === MAX_TURNS;
    const lines = [...seen.values()].map((l) => {
      const mark = l.verdict === "buy" ? "CAN BUY" : l.verdict === "ask" ? "MUST ASK" : `NOT ALLOWED: ${l.why}`;
      return `${l.ref} | ${l.title} | ${formatCents(l.priceCents)} at ${l.merchant} | ${mark}`;
    });
    const prompt = [`Listings:\n${lines.join("\n") || "(none)"}`, tried.length ? `What you did so far:\n${tried.join("\n")}` : "", last ? "This is your last turn: choose or stop." : `Turn ${turn} of ${MAX_TURNS}.`]
      .filter(Boolean)
      .join("\n\n");

    let next: z.infer<typeof Turn> | null = null;
    for (const speed of ["quick", "careful"] as const) {
      try {
        // The careful try never reuses a saved answer: it's the second opinion on the one saved for this same prompt.
        next = (await generateJson({ task: "goal-agent-v3", speed, schema: Turn, system, parts: [{ text: prompt }], fresh: speed === "careful" })).data;
        // Choosing is how it asks, so stopping with something to choose from is a bad answer. Get that second opinion.
        if (next.action !== "stop" || ![...seen.values()].some((l) => l.verdict !== "no")) break;
      } catch (e) {
        console.error(`AI shopper turn failed (${speed})`, e);
      }
    }
    if (!next) {
      say("stopped", "The AI shopper couldn't reach its AI service just now, so it stopped. Nothing was bought.");
      break;
    }

    if (next.action === "search" && !last && next.query.trim()) {
      const query = next.query.trim().slice(0, 100);
      if (tried.some((t) => t.includes(`searched "${query}"`)) || query === terms.query) {
        tried.push(`Turn ${turn}: "${query}" was already searched, so it won't find anything new. Choose or stop.`);
        continue;
      }
      const before = seen.size;
      add(await catalog.search(query, { limit: PER_SEARCH, maxPriceCents: terms.maxPriceCents ?? undefined }).catch(() => []));
      tried.push(`Turn ${turn}: searched "${query}", ${seen.size - before} new products.`);
      say("searched", `${next.thought} Searched stores for "${query}": ${seen.size - before} new ${seen.size - before === 1 ? "product" : "products"}.`);
      continue;
    }

    if (next.action === "choose") {
      const pick = [...seen.values()].find((l) => l.ref === next.listing.trim());
      if (!pick || pick.verdict === "no") {
        // Code has the last word: a listing the rules don't allow is never chosen.
        tried.push(`Turn ${turn}: chose ${next.listing || "nothing"}, refused: ${pick?.why ?? "no such listing"}.`);
        say("refused", `ShopperRelay refused the AI shopper's pick: ${pick?.why || "that listing doesn't exist"}`);
        continue;
      }
      say("chose", next.thought);
      const chosen = await chooseCatalogItem(household, pick.sourceId, pick.merchant);
      await save(chosen.id);
      const done: AgentStep[] = [];
      let purchase: Purchase;
      try {
        // The rules run again inside each of these, against the latest spending.
        purchase = pick.verdict === "buy" ? await buyWithStanding(household, chosen.id) : await sendRequest(household, chosen.id);
      } catch (e) {
        if (!(e instanceof FlowError) || pick.verdict !== "buy") throw e;
        purchase = await sendRequest(household, chosen.id);
      }
      if (purchase.state === "completed") {
        done.push({ kind: "bought", text: shown(`Bought it for ${formatCents(purchase.paypalCapturedCents ?? pick.priceCents)} at ${pick.merchant}, within ${owner}'s rules. ${owner} gets a message.`) });
      } else if (purchase.state === "requested") {
        const why = purchase.decision.outcome === "auto" ? `${owner} hasn't saved PayPal yet.` : purchase.decision.reasons.map((r) => r.message).join(" ");
        done.push({ kind: "asked", text: shown(`It can't buy this on its own, so it asked ${owner}. ${why} Nothing is paid until ${owner} decides.`) });
      } else {
        done.push({ kind: "stopped", text: "The rules don't allow this one, so nothing was bought." });
      }
      await logEvent({ householdId: household.id, purchaseId: purchase.id, type: `agent_goal_${done[0].kind}`, actor: "agent", message: done[0].text });
      return { steps: [...steps, ...done], purchase };
    }

    say("stopped", next.thought || "The AI shopper stopped without buying.");
    break;
  }

  if (steps.at(-1)?.kind !== "stopped") say("stopped", "The AI shopper ran out of turns without choosing. Nothing was bought.");
  await save(null);
  return { steps, purchase: null };
}
