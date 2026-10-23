import { capWords, outcomeWords, ruleRows } from "@/lib/client/describe";
import type { RuleSet } from "@/lib/policy/types";

const OUTCOME_CLASS = {
  auto: "text-ledger",
  review: "text-signal-text",
  exception: "text-signal-text",
  blocked: "text-stop",
} as const;

export function RulesTable({ rules, reviewer, caption }: { rules: RuleSet; reviewer: string; caption?: string }) {
  const rows = ruleRows(rules);
  return (
    <div>
      <table className="w-full border-collapse text-left">
        {caption && <caption className="mb-2 text-left text-ink-soft">{caption}</caption>}
        <thead>
          <tr className="border-b-2 border-ink/80">
            <th scope="col" className="py-2 pr-4 font-bold">
              What you&apos;re buying
            </th>
            <th scope="col" className="py-2 pr-4 font-bold">
              Amount
            </th>
            <th scope="col" className="py-2 font-bold">
              What happens
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.bands.map((b, i) => (
              <tr key={`${row.category}${i}`} className={i === row.bands.length - 1 ? "border-b border-line" : ""}>
                {i === 0 && (
                  <th scope="row" rowSpan={row.bands.length} className="py-3 pr-4 align-top font-semibold">
                    {row.label}
                  </th>
                )}
                <td className="py-3 pr-4 align-top tabular-nums">{b.range}</td>
                <td className={`py-3 align-top font-semibold ${OUTCOME_CLASS[b.outcome]}`}>{outcomeWords(b.outcome, reviewer)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {rules.categories.general && <p className="mt-3 text-base text-ink-soft">Anything that doesn&apos;t fit a category above follows General Shopping.</p>}
      {rules.caps.length > 0 && (
        <ul className="mt-4 space-y-1">
          {rules.caps.map((c, i) => (
            <li key={i}>{capWords(c, reviewer)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
