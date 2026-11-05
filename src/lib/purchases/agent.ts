// The AI shopper: given a one-time purchase authorization, it hunts for the
// authorized product and buys it at the lowest price it's allowed to.
//
// Gemini plans the hunt: what to search for, which listing to pick, and why,
// in words the customer can read. It never decides what's allowed. Code checks
// every listing against the authorization (same product, at or under the
// price, in stock, not expired) before Gemini sees it, and buyWithOtpa checks
// again before PayPal takes the money. PayPal itself can't capture more than
// it's holding, or capture twice.

import { z } from "zod";
import { generateJson } from "../ai/gemini";
import { storeAlias, stripBrand } from "../catalog/anonymize";
import { createChannel3Source } from "../catalog/channel3";
import type { Product } from "../catalog/types";
import { formatCents } from "../money";
import { logEvent } from "../store/events";
import type { Household } from "../store/households";
import type { Purchase } from "../store/purchases";
import { otpaAllows, type Otpa } from "./lifecycle";
import { buyWithOtpa, FlowError, loadCurrent } from "./service";

/** Gemini turns, counting the last one, which must buy or stop. */
const MAX_TURNS = 4;
const PER_SEARCH = 6;

export interface AgentStep {
  kind: "checked" | "searched" | "chose" | "refused" | "bought" | "asked" | "stopped";
  text: string;
}

export interface AgentRun {
  steps: AgentStep[];
  purchase: Purchase;
}

interface Listing {
  ref: string;
  sourceId: string;
  title: string;
  brand: string | null;
  modelNumber: string | null;
  merchant: string;
  priceCents: number;
  available: boolean;
  attributes: string;
  allowed: boolean;
  reason: string | null;
}

const Turn = z.object({
  thought: z.string().describe("for the customer to read: one plain sentence, under 25 words, on what you're doing next and why"),
  action: z.enum(["search", "buy", "stop"]),
  query: z.string().describe('for "search": what to type into a store search box to find more listings of this exact product; otherwise ""'),
  listing: z.string().describe('for "buy": the id of an ALLOWED listing, like "L3"; otherwise ""'),
});
type Turn = z.infer<typeof Turn>;

/** A few attributes that tell variants apart, e.g. "size: 10; color: black". */
function variantWords(p: Product): string {
  return Object.entries(p.attributes)
    .filter(([k]) => /size|color|colour|capacity|fit|width|style/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v.slice(0, 4).join(", ")}`)
    .join("; ");
}

/** For demo mode: real store and brand names out of a sentence, including in Gemini's own words. */
export function hideNames(text: string, merchants: Iterable<string>, brands: Iterable<string>): string {
  let t = text;
  for (const m of merchants) {
    t = t.split(m).join(storeAlias(m));
    // Gemini may write "Walmart" for walmart.com.
    const name = m.replace(/^www\./, "").split(".")[0];
    if (name.length >= 4) t = t.replace(new RegExp(`\\b${name}\\b`, "gi"), storeAlias(m));
  }
  for (const b of brands) t = stripBrand(t, b);
  return t;
}

function listingLine(l: Listing): string {
  const product = [l.title, l.brand && `brand ${l.brand}`, l.modelNumber && `model ${l.modelNumber}`, l.attributes].filter(Boolean).join(" | ");
  const status = l.allowed ? "ALLOWED" : `not allowed: ${l.reason}`;
  return `${l.ref} | ${product} | ${formatCents(l.priceCents)} at ${l.merchant} | ${l.available ? "in stock" : "out of stock"} | ${status}`;
}

/**
 * Run the hunt for one authorization. Returns what the AI shopper did, step by
 * step, and the purchase as it ended up (completed if it bought something).
 */
export async function runAgent(household: Household, id: string): Promise<AgentRun> {
  const start = await loadCurrent(household, id);
  if (start.state !== "hunting" || !start.otpa || start.otpa.status !== "active") {
    throw new FlowError(`This authorization is ${start.state === "hunting" ? "not ready" : start.state}.`, 409);
  }
  const otpa: Otpa = start.otpa;
  const reviewer = start.reviewerName ?? household.reviewerName;
  const catalog = createChannel3Source();

  // Every listing seen so far, checked by code. Refs stay stable across turns.
  const seen = new Map<string, Listing>();
  const brands = new Set<string>();
  function add(products: Product[]): Listing[] {
    const added: Listing[] = [];
    for (const p of products) {
      if (p.brand) brands.add(p.brand);
      for (const o of p.offers.slice(0, 4)) {
        const key = `${p.sourceId}|${o.merchant}`;
        if (seen.has(key)) continue;
        const check = otpaAllows(otpa, {
          sourceId: p.sourceId,
          brand: p.brand,
          modelNumber: p.modelNumber,
          priceCents: o.priceCents,
          available: o.available,
        });
        const listing: Listing = {
          ref: `L${seen.size + 1}`,
          sourceId: p.sourceId,
          title: p.title,
          brand: p.brand,
          modelNumber: p.modelNumber,
          merchant: o.merchant,
          priceCents: o.priceCents,
          available: o.available,
          attributes: variantWords(p),
          allowed: check.ok,
          reason: check.ok ? null : check.reason,
        };
        seen.set(key, listing);
        added.push(listing);
      }
    }
    return added;
  }

  // In demo mode the screen mustn't show real store or brand names, including in Gemini's own words.
  const shown = (text: string) => (household.hideBrands ? hideNames(text, [...seen.values()].map((l) => l.merchant), brands) : text);
  const steps: AgentStep[] = [];
  const say = async (kind: AgentStep["kind"], text: string, log = true) => {
    steps.push({ kind, text: shown(text) });
    if (log)
      await logEvent({
        householdId: household.id,
        purchaseId: id,
        type: `agent_${kind}`,
        actor: "agent",
        message: shown(text),
      });
  };
  const cheapestAllowed = () => [...seen.values()].filter((l) => l.allowed).sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;

  // First, the stores that list the authorized product itself.
  const own = otpa.product.sourceId ? await catalog.get(otpa.product.sourceId) : null;
  const first = add(own ? [own] : []);
  const okFirst = first.filter((l) => l.allowed).length;
  await say(
    "checked",
    first.length
      ? `Checked where ${otpa.product.title} is listed now: ${first.length} ${first.length === 1 ? "store" : "stores"}, ${okFirst} at ${formatCents(otpa.maxCents)} or less.`
      : `No store lists ${otpa.product.title} directly right now. Searching other stores.`,
  );

  const system = `You are ${household.shopperName}'s AI shopper in ShopperRelay. ${reviewer} gave a one-time PayPal authorization to buy one exact product, once, for ${formatCents(otpa.maxCents)} or less.
Your job: buy that exact product at the lowest price you can find.
- ShopperRelay's code has already checked every listing and marked it ALLOWED or "not allowed" with the reason. You may only buy an ALLOWED listing. The code checks again before paying, so never argue with a "not allowed".
- Search when another store might list the same product for less, or when nothing is ALLOWED yet. The brand and model number are the best search words. Don't repeat a search or reword one: if a search found no other listings of this exact product, another search won't either, so buy.
- ${otpa.details ? `${reviewer} also said: "${otpa.details}". Prefer a listing that fits; if a listing doesn't show it, say so in your thought.` : "There are no extra requirements."}
- When you are confident the cheapest ALLOWED listing is the best you'll find, buy it. If nothing is ALLOWED after searching, stop and say why.
- You have ${MAX_TURNS} turns in all. Write "thought" for ${reviewer} to read: plain words, no jargon, no listing ids.`;

  const history: string[] = [];
  const product = [otpa.product.title, otpa.product.brand && `brand ${otpa.product.brand}`, otpa.product.modelNumber && `model ${otpa.product.modelNumber}`]
    .filter(Boolean)
    .join(" | ");

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const last = turn === MAX_TURNS;
    const prompt = [
      `Authorized product: ${product}`,
      `Maximum: ${formatCents(otpa.maxCents)}. Expires ${otpa.expiresAt}.`,
      `Listings seen so far:\n${[...seen.values()].map(listingLine).join("\n") || "(none)"}`,
      history.length ? `What you did so far:\n${history.join("\n")}` : "",
      last ? "This is your last turn: buy an ALLOWED listing or stop." : `Turn ${turn} of ${MAX_TURNS}.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    // A quick model first; if that fails, the careful ones once more before giving up.
    let next: Turn | null = null;
    for (const speed of ["quick", "careful"] as const) {
      try {
        next = (await generateJson({ task: "otpa-agent-v1", speed, schema: Turn, system, parts: [{ text: prompt }] })).data;
        break;
      } catch (e) {
        console.error(`AI shopper turn failed (${speed})`, e);
      }
    }
    if (!next) {
      await say("stopped", "The AI shopper couldn't reach its AI service just now, so it stopped. Nothing was bought; you can try again or buy it yourself.");
      break;
    }

    if (next.action === "search" && !last && next.query.trim()) {
      const query = next.query.trim().slice(0, 100);
      const found = add(await catalog.search(query, { limit: PER_SEARCH }).catch(() => []));
      const matches = found.filter((l) => l.allowed);
      history.push(`Turn ${turn}: searched "${query}". ${found.length} new listings, ${matches.length} ALLOWED.`);
      const best = matches.sort((a, b) => a.priceCents - b.priceCents)[0];
      await say(
        "searched",
        `${next.thought} Searched stores for "${query}": ${matches.length ? `${matches.length} more listing${matches.length === 1 ? "" : "s"} of this product, the cheapest ${formatCents(best.priceCents)} at ${best.merchant}` : "no other listings of this exact product"}.`,
      );
      continue;
    }

    if (next.action === "buy") {
      const pick = [...seen.values()].find((l) => l.ref === next.listing.trim());
      if (!pick || !pick.allowed) {
        // Code has the last word: a listing it hasn't allowed is never bought.
        history.push(`Turn ${turn}: tried to buy ${next.listing || "nothing"}, refused: ${pick?.reason ?? "no such listing"}.`);
        await say("refused", `ShopperRelay refused the AI shopper's pick: ${pick?.reason ?? "that listing doesn't exist"}`);
        continue;
      }
      const cheaper = cheapestAllowed();
      const note = cheaper && cheaper.priceCents < pick.priceCents ? ` It chose this over ${formatCents(cheaper.priceCents)} at ${cheaper.merchant}.` : "";
      await say("chose", `${next.thought}${note}`);
      try {
        const purchase = await buyWithOtpa(household, id, pick.sourceId, pick.merchant, "agent");
        const captured = purchase.paypalCapturedCents ?? pick.priceCents;
        steps.push({
          kind: "bought",
          text: shown(
            `Bought it for ${formatCents(captured)} at ${pick.merchant}. PayPal took ${formatCents(captured)} from the ${formatCents(otpa.maxCents)} hold${captured < otpa.maxCents ? ` and released the other ${formatCents(otpa.maxCents - captured)}` : ""}. The authorization is used up.`,
          ),
        });
        return { steps, purchase };
      } catch (e) {
        await say("stopped", `The purchase didn't go through: ${e instanceof Error ? e.message : String(e)} Nothing was charged.`);
        break;
      }
    }

    // "stop", or a search with nothing to search for, or a search on the last turn.
    await say("stopped", next.thought || "The AI shopper stopped without buying.");
    break;
  }

  if (steps.at(-1)?.kind !== "stopped") await say("stopped", "The AI shopper ran out of turns without buying. Nothing was charged.");
  return { steps, purchase: await loadCurrent(household, id) };
}
