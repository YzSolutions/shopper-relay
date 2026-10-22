# Working Title

> The product name is not final. Set `NEXT_PUBLIC_BRAND_NAME` to rename it everywhere.

An AI shopping and payment companion built on PayPal, made for the PayPal AI Hackathon.
It helps an older adult shop on their own, and they set the rules for when someone they
trust should take a second look.

**AI understands. Rules enforce. People approve. PayPal executes.**

- **AI** turns plain-English spending rules into structured rules and points out any gaps.
  It also explains products and reads checkout screenshots for recurring charges and fine print.
- **Deterministic code** decides who approves each purchase. AI never makes that call.
- **The trusted contact** reviews only the purchases the owner's own rules send to them.
- **PayPal** authorizes (holds) every payment. The hold is captured when the purchase is
  approved and voided when it's declined. PayPal's held amount is the only figure that counts.

## Flow

```
Rules setup -> in-app shopping (Channel3) or screenshot check -> AI explains terms
  -> category + spending policy (code) -> PayPal AUTHORIZE
  -> owner may approve alone? capture : trusted contact reviews -> capture | void
  -> why log
```

In the prototype, the app is the sandbox merchant that receives payment. **Placing the
order with the retailer is simulated.**

## Status

| Piece | State |
| --- | --- |
| Policy engine: per-category thresholds, weekly limits, gap detection, strictest-rule category handling | Done, with tests |
| Rule changes: tightening applies immediately, loosening has a 24h cooling-off period the contact can shorten | Done, with tests |
| PayPal amount check (an exact match to the held amount is required) | Done, with tests |
| PayPal authorize / capture / void client and sandbox check script | Written, not yet run against sandbox |
| Gemini: rule parsing, screenshot reading, explanations | Not started |
| Channel3 product search | Not started |
| Mom UI, Sarah's mobile review page, why log | Not started |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm test                     # policy engine tests
npm run paypal:check         # sandbox: authorize then capture
npm run paypal:check -- --void
npm run dev
```

## Code map

- `src/lib/policy/`: the deterministic rules engine. It has no I/O and no AI.
- `src/lib/paypal/client.ts`: PayPal Orders v2 / Payments v2 (authorize, capture, void).
- `src/config/brand.ts`: product name and demo persona names.
- `scripts/paypal-sandbox-check.ts`: the day-1 PayPal lifecycle test.

## License

MIT
