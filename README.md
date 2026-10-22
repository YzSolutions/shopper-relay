# ShopperRelay

ShopperRelay is AI shopping help built on PayPal, made for the PayPal AI Hackathon. One
person finds what to buy. Rules decide whether they can buy it alone or whether it goes
to someone else for review. PayPal holds the payment until it's settled.

**AI understands. Rules enforce. People approve. PayPal executes.**

## Three applications

| | Who shops | Who reviews | Whose rules | Who's in control |
| --- | --- | --- | --- | --- |
| **Elderly parent + adult child** | Mom | Her daughter, when Mom's rules ask | Mom's | Mom keeps control of her money. |
| **Kids + parents** | A child finds shoes, a game or school supplies and sends a request | The parent reviews the price, then approves or declines | The parent's | The parent controls spending and payment for a minor. |
| **Personal shopper + customer** | Someone who knows your taste finds products and deals | You review their recommendations | Yours | You make the buying decision. |

All three use the same engine. The roles are `shopper` and `reviewer`, and the setup
decides whose rules they are. That ownership changes how rule changes work:

- **Tightening** a rule always takes effect immediately, whoever asks.
- **Loosening, when the shopper owns the rules (Mom):** the reviewer is notified and can
  approve it early. Otherwise it takes effect automatically after 24 hours, so the
  reviewer can speed a change up but never block it. The reviewer can't loosen the
  shopper's rules.
- **Loosening, when the reviewer owns the rules (parent, customer):** it takes effect
  immediately when the reviewer makes it. When the shopper asks for it, it waits for the
  reviewer to approve, with no time limit.

The hackathon demo tells the Mom and Sarah story. Set `NEXT_PUBLIC_DEMO_RELATIONSHIP` to
switch to one of the other two.

## How it works

- **AI** turns plain-English spending rules into structured rules and points out any gaps.
  It also explains products and reads checkout screenshots for recurring charges and fine print.
- **Deterministic code** decides who approves each purchase. AI never makes that call.
- **The reviewer** sees only the purchases the rules send to them.
- **PayPal** authorizes (holds) every payment. The hold is captured when the purchase is
  approved and voided when it's declined. PayPal's held amount is the only figure that counts.

```
Rules setup -> in-app shopping (Channel3) or screenshot check -> AI explains terms
  -> category + spending policy (code) -> PayPal AUTHORIZE
  -> shopper may approve alone? capture : reviewer decides -> capture | void
  -> why log
```

In the prototype, ShopperRelay is the sandbox merchant that receives payment. **Placing
the order with the retailer is simulated.**

## Status

| Piece | State |
| --- | --- |
| Policy engine: per-category thresholds, weekly limits, gap detection, strictest-rule category handling | Done, with tests |
| Rule changes: depend on whose rules they are (24h cooling-off, or reviewer approval) | Done, with tests |
| PayPal amount check (an exact match to the held amount is required) | Done, with tests |
| PayPal authorize / capture / void client and sandbox check script | Written, not yet run against sandbox |
| Gemini: rule parsing, screenshot reading, explanations | Not started |
| Channel3 product search | Not started |
| Shopper UI, reviewer's mobile page, why log | Not started |

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
- `src/config/brand.ts`: the product name.
- `src/config/relationships.ts`: the three applications, with their roles and demo names.
- `scripts/paypal-sandbox-check.ts`: the day-1 PayPal lifecycle test.

## License

MIT
