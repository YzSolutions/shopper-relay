import { OUTCOMES, type AmountBand, type Outcome } from "./types";

const RANK = Object.fromEntries(OUTCOMES.map((o, i) => [o, i])) as Record<Outcome, number>;

export function stricter(a: Outcome, b: Outcome): Outcome {
  return RANK[a] >= RANK[b] ? a : b;
}

export function isStricter(a: Outcome, b: Outcome): boolean {
  return RANK[a] > RANK[b];
}

/** What an undefined range means: someone has to look at it. */
export const GAP_OUTCOME: Outcome = "review";

export interface Segment {
  minCents: number;
  maxCents: number | null;
  /** null when no band covers this range (a gap). */
  outcome: Outcome | null;
}

export interface BandIssue {
  kind: "gap" | "conflict";
  minCents: number;
  maxCents: number | null;
}

export interface Range {
  minCents: number;
  maxCents: number | null;
}

function covers(band: AmountBand, cents: number): boolean {
  return band.minCents <= cents && (band.maxCents === null || cents < band.maxCents);
}

function edgesOf(...bandLists: AmountBand[][]): number[] {
  const edges = new Set<number>([0]);
  for (const bands of bandLists) {
    for (const b of bands) {
      edges.add(b.minCents);
      if (b.maxCents !== null) edges.add(b.maxCents);
    }
  }
  return [...edges].sort((a, b) => a - b);
}

/** Walk consecutive edges as [min, max) pieces covering [0, ∞). */
function pieces(edges: number[]): Array<[number, number | null]> {
  return edges.map((min, i) => [min, i + 1 < edges.length ? edges[i + 1] : null]);
}

function mergeAdjacent<T extends Range>(items: T[], same: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.maxCents === item.minCents && same(last, item)) {
      out[out.length - 1] = { ...last, maxCents: item.maxCents };
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

/**
 * Split [0, ∞) into pieces and give each one its outcome. Gaps (no band) and
 * conflicts (bands disagree) are reported; a conflict resolves to the stricter
 * outcome, and a gap has none until the rule owner fills it in.
 */
export function segment(bands: AmountBand[]): { segments: Segment[]; issues: BandIssue[] } {
  const segments: Segment[] = [];
  const issues: BandIssue[] = [];
  for (const [minCents, maxCents] of pieces(edgesOf(bands))) {
    const outcomes = new Set(bands.filter((b) => covers(b, minCents)).map((b) => b.outcome));
    let outcome: Outcome | null = null;
    if (outcomes.size === 0) {
      issues.push({ kind: "gap", minCents, maxCents });
    } else {
      if (outcomes.size > 1) issues.push({ kind: "conflict", minCents, maxCents });
      outcome = [...outcomes].reduce(stricter);
    }
    segments.push({ minCents, maxCents, outcome });
  }
  return {
    segments: mergeAdjacent(segments, (a, b) => a.outcome === b.outcome),
    issues: mergeAdjacent(issues, (a, b) => a.kind === b.kind),
  };
}

/** The segment containing an amount. Gaps come back with outcome null. */
export function segmentAt(bands: AmountBand[], cents: number): Segment {
  const { segments } = segment(bands);
  return segments.find((s) => s.minCents <= cents && (s.maxCents === null || cents < s.maxCents))!;
}

/** The outcome for this amount, treating an undefined range as needing review. */
export function outcomeAt(bands: AmountBand[], cents: number): Outcome {
  return segmentAt(bands, cents).outcome ?? GAP_OUTCOME;
}

/** Pointwise-strictest combination of two band sets, with no gaps. */
export function strictestBands(a: AmountBand[], b: AmountBand[]): AmountBand[] {
  const out = pieces(edgesOf(a, b)).map(([minCents, maxCents]) => ({
    minCents,
    maxCents,
    outcome: stricter(outcomeAt(a, minCents), outcomeAt(b, minCents)),
  }));
  return mergeAdjacent(out, (x, y) => x.outcome === y.outcome);
}

/** Ranges where `next` is less restrictive than `prev`. */
export function loosenedRanges(prev: AmountBand[], next: AmountBand[]): Range[] {
  return diffRanges(prev, next, (p, n) => isStricter(p, n));
}

/** Ranges where `next` is more restrictive than `prev`. */
export function tightenedRanges(prev: AmountBand[], next: AmountBand[]): Range[] {
  return diffRanges(prev, next, (p, n) => isStricter(n, p));
}

function diffRanges(prev: AmountBand[], next: AmountBand[], changed: (p: Outcome, n: Outcome) => boolean): Range[] {
  const ranges = pieces(edgesOf(prev, next))
    .filter(([min]) => changed(outcomeAt(prev, min), outcomeAt(next, min)))
    .map(([minCents, maxCents]) => ({ minCents, maxCents }));
  return mergeAdjacent(ranges, () => true);
}
