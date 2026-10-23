# ShopperRelay

**Shopping help you control.** ShopperRelay lets an older adult shop on their own, understand
what they're really buying, and set their own rules for when someone they trust takes a second
look. PayPal holds each payment until it's settled.

**AI understands. Rules enforce. People approve. PayPal executes.**

Built for the PayPal AI Hackathon.

- **Live demo:** https://shopper-relay.vercel.app/demo (shopper and reviewer side by side)
- **Shopper app on its own:** https://shopper-relay.vercel.app
- Everything runs on the PayPal **sandbox**. No real money moves.

## Try it in two minutes

1. Open **/demo**. Mom's screen is on the left, Sarah's phone on the right.
2. In Mom's screen, search **blood pressure monitor**. Each result shows what it's *counted as*
   (Medical Devices, from the store's own category) and whether Mom can buy it herself or Sarah
   takes a look first.
3. Choose one **under $100**, then pay with PayPal. It's within Mom's rules, so PayPal holds the
   money and the payment completes straight away.
4. Go to **Check a checkout**, choose the example **"Monitor with a membership in the small
   print"**. The AI reads the screenshot and finds the $39/month membership hidden in the small
   print. Choose **Buy it through ShopperRelay** and pay.
5. Sarah's phone shows the request. Open it: she sees the same facts Mom saw, why she's being
   asked, and the amount PayPal is holding. **Approve** captures the payment; **Decline** releases
   the hold.
6. Try **My rules**: write *"Under $75 I decide. Over $150 Sarah decides."* The app asks what
   should happen between $75 and $150, and won't save until that gap is filled.

**Paying in the sandbox:** log in with a PayPal sandbox personal account, or choose **Debit or
Credit Card** and use the sandbox test card `4111 1111 1111 1111` with any future expiry and any
CVV. **Simulate 24 hours** in the demo controls shows what happens when Sarah doesn't answer: the
hold is released.

## How it works

```
Mom searches (Channel3) ──or── uploads a checkout screenshot (Gemini reads it)
        │
        ▼
Category from the catalog; AI only as a fallback, and doubt applies the stricter rule
        │
        ▼
Mom's rules, checked by plain code ──► preview: "You can buy this" / "Sarah takes a look"
        │
        ▼
PayPal Orders v2, intent AUTHORIZE: Mom approves in PayPal, the money is HELD
        │
        ▼
Read the hold back from PayPal. Amount must match what Mom reviewed, to the cent.
Run the rules again against PayPal's amount and up-to-date spending.
        │
        ├── within Mom's rules ─────────────► capture
        ├── needs Sarah ──► Sarah's link ──► approve: capture   decline: void
        │                                   no answer in 24h: void
        └── blocked or amount mismatch ─────► void
        │
        ▼
Why log: every step and its reason. PayPal webhooks (signature-verified) confirm.
```

### PayPal

- **Orders v2 with `intent: AUTHORIZE`** and **Payments v2 capture and void**: approval only
  places a hold, and ShopperRelay decides afterwards whether to capture or void it. This is what
  makes "Sarah reviews it first" possible without ever charging Mom for something that's declined.
- **PayPal's held amount is authoritative.** The app reads the authorization back from PayPal
  and refuses to continue if it differs from what Mom reviewed by even a cent.
- **Smart Buttons (JS SDK)** for checkout, **idempotency keys** on every money-moving call, and
  **webhooks** verified with PayPal's signature-verification API.
- In the prototype ShopperRelay is the sandbox merchant. Placing the order with the store is
  simulated and labelled as such.

### AI (Google Gemini, `gemini-3.8-flash` with fallback models)

What the AI does:

- Turns plain-English rules into structured rules.
- Reads checkout screenshots for the real total, recurring charges, trials and cancellation
  terms, and quotes the exact small print.
- Explains search results in plain language.
- Suggests a category only when the catalog has none.

What the AI never does:

- **Decide a payment.** The decision is made by deterministic, tested code.
- **Override PayPal's amount.**
- **Choose a looser category.** When the catalog and the AI disagree, or the AI isn't
  confident, both rules apply and the stricter one wins.
- **Find rule gaps.** The engine finds them; the questions back to the person are written by code.
- **Give medical advice.** It never calls two products "equivalent", and it says "No recurring
  charge listed" rather than "no subscription".
- **Treat doubt as a no.** If it isn't sure whether a charge repeats, the purchase is treated as
  recurring.

Every AI answer is checked against a schema before use. Calls are retried, fall back to other
models, and identical questions reuse a saved answer, so a busy model can't stall a purchase.

### Channel3

- In-app product search, so an older adult never has to copy links or describe a product.
- Real prices, stores, stock and catalog categories.
- **Same product** is claimed only when Channel3 groups listings under one product, or the brand
  and model number match exactly. Everything else is labelled as a different product.
- Product sources sit behind an adapter, so more sources can be added later.

## Safeguards that keep Mom in charge

- **Mom writes her own rules.** Sarah only sees purchases Mom's rules send to her.
- **Tightening a rule** takes effect immediately.
- **Loosening a safeguard** notifies Sarah. Sarah can let it start right away; otherwise it starts
  automatically after 24 hours. Sarah can speed a change up but can never block it. This stops a
  scammer pressuring Mom into switching protections off on the spot, without giving Sarah a veto
  over Mom's money.
- **Rules with gaps can't be saved.** Any amount not covered by a rule goes to review until it's
  decided.
- **Spending caps** (per purchase, rolling 7 and 30 days) count purchases still waiting for review,
  so two smaller purchases can't slip past a limit together.

## One engine, three relationships

The same engine is designed for three relationships. Only Mom + Sarah has screens in this build.

| | Mom + Sarah | Kids + parents | Personal shopper + customer |
| --- | --- | --- | --- |
| Finds products | Mom | Child | Trusted shopper |
| Sets the rules and pays | Mom | Parent | Customer |
| Buys without a second person? | Within her own rules | Never | Within the customer's limits |
| Over a limit | Sarah reviews | Parent approves an exception | Customer approves |

All three presets are fully implemented and tested in the rules engine
([`presets.ts`](src/lib/policy/presets.ts)):
- **Mom:** buys on her own under $75 for general shopping, $80 for clothing, $100 for medical
  devices and food, and $150 for medical visits. Subscriptions are always reviewed.
- **Kids:** small per-item budgets ($8 to $30), with $30 a week and $100 a month overall.
  Subscriptions are blocked.
- **Personal shopper:** may buy straight away within delegated limits ($125 per purchase, $250 a
  week, $600 a month). Buying while the customer isn't present would need a saved,
  customer-authorized PayPal payment method, which isn't built.

## What's real and what's simulated

| Real | Simulated |
| --- | --- |
| PayPal sandbox authorize, capture, void and webhooks | Placing the order with the store |
| Channel3 product search and prices | Sarah's text messages (her inbox at `/sarah` stands in for her phone) |
| Gemini rule parsing, screenshot reading, explanations | Passing time (**Simulate 24 hours**) |
| Neon Postgres storage and the why log | The store in the screenshot examples is made up |

The demo has no sign-in: one shared Mom + Sarah household, which **Reset demo** restores. For the
video, **Hide real store and brand names** swaps real store names for invented ones and blurs
product photos.

## Built with

Next.js 16 and TypeScript on Vercel; PayPal Orders v2, Payments v2 and the JS SDK; Google Gemini;
Channel3; Neon Postgres; Tailwind CSS; Vitest. Development was assisted by Claude Code.

## Run it yourself

```bash
npm install
cp .env.example .env.local   # PayPal sandbox app, Channel3, Gemini and Neon keys
npm run db:migrate           # create the tables
npm test                     # unit tests (rules engine, lifecycle, AI post-processing, catalog)
npm run dev                  # http://localhost:3000, and /demo
npm run e2e                  # full flow against the running app and the PayPal sandbox
```

Service checks: `npm run paypal:check`, `npm run channel3:check`, `npm run gemini:check`,
`npm run ai:check`.

## Code map

- `src/lib/policy/`: the rules engine, plain code with no I/O and no AI.
- `src/lib/purchases/`: the purchase lifecycle and the service that runs it against PayPal.
- `src/lib/paypal/client.ts`: Orders v2 / Payments v2, webhook verification.
- `src/lib/ai/`: the Gemini jobs.
- `src/lib/catalog/`: Channel3 adapter, comparisons, demo name hiding.
- `src/lib/store/`, `db/migrations/`: Postgres storage.
- `src/app/`: screens and the HTTP API (`src/app/api/`).

## License

The code is MIT licensed. The ShopperRelay name and logo (`public/brand/`) are not covered by the
MIT license and may not be used without permission.
