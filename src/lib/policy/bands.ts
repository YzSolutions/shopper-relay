import type { AmountBand, Approver } from "./types";

const RANK: Record<Approver, number> = { shopper: 0, reviewer: 1 };

export function stricter(a: Approver, b: Approver): Approver {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface Segment {
  minCents: number;
  maxCents: number | null;
  /** null when no band covers this range (a gap). */
  approver: Approver | null;
}

export interface BandIssue {
  kind: "gap" | "conflict";
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

function mergeAdjacent<T extends { minCents: number; maxCents: number | null }>(
  items: T[],
  same: (a: T, b: T) => boolean,
): T[] {
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
 * Split [0, ∞) into pieces and say who approves each one. Gaps (no band) and
 * conflicts (bands disagree) are reported; a conflict resolves to the stricter
 * approver, and a gap has no approver until the rule owner fills it in.
 */
export function segment(bands: AmountBand[]): { segments: Segment[]; issues: BandIssue[] } {
  const segments: Segment[] = [];
  const issues: BandIssue[] = [];
  for (const [minCents, maxCents] of pieces(edgesOf(bands))) {
    const approvers = new Set(bands.filter((b) => covers(b, minCents)).map((b) => b.approver));
    let approver: Approver | null = null;
    if (approvers.size === 0) {
      issues.push({ kind: "gap", minCents, maxCents });
    } else {
      if (approvers.size > 1) issues.push({ kind: "conflict", minCents, maxCents });
      approver = [...approvers].reduce(stricter);
    }
    segments.push({ minCents, maxCents, approver });
  }
  return {
    segments: mergeAdjacent(segments, (a, b) => a.approver === b.approver),
    issues: mergeAdjacent(issues, (a, b) => a.kind === b.kind),
  };
}

/** The segment containing an amount. Gaps come back with approver null. */
export function segmentAt(bands: AmountBand[], cents: number): Segment {
  const { segments } = segment(bands);
  return segments.find((s) => s.minCents <= cents && (s.maxCents === null || cents < s.maxCents))!;
}

/** Who approves this amount, treating an undefined range as needing review. */
export function approverAt(bands: AmountBand[], cents: number): Approver {
  return segmentAt(bands, cents).approver ?? "reviewer";
}

/** Pointwise-strictest combination of two band sets, with no gaps. */
export function strictestBands(a: AmountBand[], b: AmountBand[]): AmountBand[] {
  const out = pieces(edgesOf(a, b)).map(([minCents, maxCents]) => ({
    minCents,
    maxCents,
    approver: stricter(approverAt(a, minCents), approverAt(b, minCents)),
  }));
  return mergeAdjacent(out, (x, y) => x.approver === y.approver);
}

/** Ranges where `next` lets the shopper approve alone but `prev` did not. */
export function loosenedRanges(prev: AmountBand[], next: AmountBand[]): BandIssue[] {
  return diffRanges(prev, next, "shopper");
}

/** Ranges where `next` sends to review but `prev` let the shopper approve alone. */
export function tightenedRanges(prev: AmountBand[], next: AmountBand[]): BandIssue[] {
  return diffRanges(prev, next, "reviewer");
}

function diffRanges(prev: AmountBand[], next: AmountBand[], becomes: Approver): BandIssue[] {
  const changed = pieces(edgesOf(prev, next))
    .filter(([min]) => approverAt(prev, min) !== becomes && approverAt(next, min) === becomes)
    .map(([minCents, maxCents]) => ({ kind: "gap" as const, minCents, maxCents }));
  return mergeAdjacent(changed, () => true);
}
