import { describe, expect, it } from "vitest";
import { recurringFinding, type AiTerms } from "./terms";

const terms = (over: Partial<Omit<AiTerms, "recurring">> & { recurring?: Partial<AiTerms["recurring"]> } = {}): AiTerms => ({
  readable: true,
  productName: "Monitor",
  seller: "Shop",
  itemPriceDollars: 149,
  shippingDollars: 0,
  taxDollars: 0,
  totalDueTodayDollars: 149,
  trial: null,
  cancellation: null,
  returns: null,
  otherImportantTerms: [],
  plainSummary: "",
  ...over,
  recurring: { found: "no", amountDollars: null, interval: null, startsWhen: null, evidence: [], ...over.recurring },
});

describe("recurringFinding", () => {
  it("accepts a clean one-time purchase, even when the model quotes the one-time wording", () => {
    expect(recurringFinding(terms({ recurring: { evidence: ["This is a one-time purchase."] } }))).toBe("no");
  });

  it("overrules a 'no' when the extracted text mentions renewal or a trial", () => {
    expect(recurringFinding(terms({ recurring: { evidence: ["Renews at $39/month"] } }))).toBe("uncertain");
    expect(recurringFinding(terms({ trial: "30-day free trial of Plus" }))).toBe("uncertain");
    expect(recurringFinding(terms({ otherImportantTerms: ["Subscribe & save, ships monthly"] }))).toBe("uncertain");
  });

  it("keeps yes and uncertain as they are", () => {
    expect(recurringFinding(terms({ recurring: { found: "yes" } }))).toBe("yes");
    expect(recurringFinding(terms({ recurring: { found: "uncertain" } }))).toBe("uncertain");
  });

  it("treats an unreadable image as uncertain", () => {
    expect(recurringFinding(terms({ readable: false }))).toBe("uncertain");
  });
});
