# ShopperRelay

ShopperRelay is AI shopping help built on PayPal, made for the PayPal AI Hackathon. One
person finds what to buy. Rules decide whether they can buy it alone or whether it goes
to someone else for review. PayPal holds the payment until it's settled.

**AI understands. Rules enforce. People approve. PayPal executes.**

## Three applications, one rules engine

| | Mom + Sarah | Kids + parents | Personal shopper + customer |
| --- | --- | --- | --- |
| Finds products | Mom | Child | Trusted shopper |
| Sets the rules | Mom | Parent | Customer |
| Pays | Mom | Parent | Customer |
| Can buy without a second person? | Mom, within her own rules | Never | The shopper, within delegated limits |
| Over a limit | Sarah reviews | Parent must approve an exception | Customer approves |
| Weekly / monthly caps | Optional | $30 / $100 | $250 / $600, plus $125 per purchase |
| Hackathon build | **Working end to end** | Planned | Planned |

Each purchase gets one outcome: **auto** (the shopper can buy now), **review**,
**exception** (over a limit, so the reviewer must knowingly approve it) or **blocked**.
The default limits for each preset are in [`presets.ts`](src/lib/policy/presets.ts).

| Mom + Sarah: Mom buys on her own | Under |
| --- | --- |
| General Shopping | $75 |
| Clothing | $80 |
| Medical Devices | $100 |
| Food & Groceries | $100 |
| Medical Visits | $150 (kept in the rules; not part of product search) |
| Subscriptions | Always reviewed |

| Kids: per-item budget (parent approves everything) | Up to |
| --- | --- |
| Food / snacks | $8 |
| General Shopping | $10 |
| Toys, Books | $15 |
| Video Games, School Supplies | $20 |
| Clothing, Shoes | $25 |
| Electronics | $30 |
| Subscriptions | Blocked |

| Personal shopper: may buy immediately | Up to |
| --- | --- |
| General Shopping | $50 |
| Gifts, Collectibles | $75 |
| Clothing, Shoes & Handbags, Home & Décor | $100 |
| Electronics | $125 |
| Subscriptions | Customer must approve |

All limits apply to the full PayPal total, shipping and tax included. Weeks and months are
rolling (the last 7 or 30 days), and pending purchases count until they finish or are
cancelled. For the personal shopper preset, buying without the customer present will need a
saved, customer-authorized PayPal payment method. That isn't built yet, and the PayPal
capability still has to be confirmed.

The roles are `shopper` and `reviewer`, and each preset says whose rules they are. That
ownership changes how rule changes work:

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
| Policy engine: outcomes (auto/review/exception/blocked), per-category limits, per-purchase/weekly/monthly caps, gap detection, strictest-rule categories | Done, with tests |
| Three presets: Mom + Sarah, kids + parents, personal shopper | Done, with tests (only Mom + Sarah gets screens in the hackathon build) |
| Rule changes: depend on whose rules they are (24h cooling-off, or reviewer approval) | Done, with tests |
| PayPal amount check (an exact match to the held amount is required) | Done, with tests |
| Purchase lifecycle: PayPal hold, re-check against PayPal's amount, capture / reviewer / void, 24h expiry | Done, with tests and a sandbox end-to-end run |
| PayPal: Orders v2 authorize, capture, void; webhook verification | Done |
| Gemini: rule parsing, checkout-screenshot reading, result explanations, category fallback (retries, fallback models, saved answers) | Done |
| Channel3 product search, normalized products, same product vs similar | Done |
| Neon Postgres: households, rules, purchases, why log | Done |
| API routes for the whole flow | Done |
| Screens: shop, check a checkout, purchase status with PayPal buttons, my rules, history | Done |
| Reviewer: mobile review page and inbox; split-screen demo at `/demo` | Done |
| Hiding real store names for the video, final polish | Week 3 |

## Try it

- `/demo`: the shopper's app and the reviewer's phone side by side, with demo-only controls (simulate 24 hours, reset).
- Paying in the PayPal sandbox: log in with a sandbox personal account, or choose **Debit or Credit Card** and use a
  PayPal sandbox test card (for example `4111 1111 1111 1111`, any future expiry, any CVV). No real money moves.
- To see a review: search for something over a limit (a blood pressure monitor over $100), or use **Check a checkout**
  with the membership example and buy it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run db:migrate           # create the database tables (Neon)
npm test                     # unit tests
npm run paypal:check         # sandbox: authorize then capture
npm run paypal:check -- --void
npm run channel3:check -- "winter coat"   # product search, and how each result is categorized
npm run gemini:check         # models your key can use, and a structured-output test
npm run ai:check             # every AI job against real inputs
npm run dev
npm run e2e                  # full flow against the running app and the PayPal sandbox (sandbox only)
```

## Code map

- `src/lib/policy/`: the deterministic rules engine. It has no I/O and no AI.
- `src/lib/policy/presets.ts`: default limits for the three applications.
- `src/lib/purchases/`: the purchase lifecycle (pure) and the service that runs it against PayPal and the database.
- `src/lib/paypal/client.ts`: PayPal Orders v2 / Payments v2 (authorize, capture, void), webhook verification.
- `src/lib/catalog/`: product sources (Channel3 today) and same product vs similar comparison.
- `src/lib/ai/`: Gemini jobs. AI explains and extracts; it never makes a payment decision.
- `src/lib/store/`, `db/migrations/`: Neon Postgres storage.
- `src/app/api/`: the HTTP API.
- `src/config/brand.ts`: the product name.
- `src/config/relationships.ts`: the three applications: roles, who pays, demo names.
- `public/brand/`: logo (not MIT licensed). `public/demo/`: fictional checkout screenshots.
- `scripts/`: service checks, the end-to-end run, and the demo screenshot generator.

## License

The code is MIT licensed. The ShopperRelay name and logo (`public/brand/`) are not covered by
the MIT license and may not be used without permission.
