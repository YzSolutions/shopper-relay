# ShopperRelay

**Shopping help you control.** One person finds what to buy. Their rules decide whether they
can buy it on their own or whether someone they trust takes a look. PayPal holds the money until
it's settled.

**AI understands. Rules enforce. People approve. PayPal executes.**

Built for the PayPal AI Hackathon.

- **Live demo:** https://shopperrelay.com/demo (the shopper and the reviewer side by side, with
  tabs for all three relationships)
- **Shopper app on its own:** https://shopperrelay.com
- **Backup address** (same app): https://shopper-relay.vercel.app
- Everything runs on the PayPal **sandbox**. No real money moves.

## Three relationships, one engine

| | Mom + Sarah | Kids + parent | Personal shopper + customer |
| --- | --- | --- | --- |
| Who shops | Mom | Leo (a child) | Priya (a personal shopper) |
| Whose rules | Mom's own | Dana's (the parent) | Marcus's (the customer) |
| Who pays | Mom | Dana | Marcus |
| How a purchase completes | Within Mom's rules: straight away. Otherwise PayPal **holds** it while Sarah takes a look. | Leo **asks**. Dana approves and pays with her own PayPal, or says no. | Priya **asks**. Marcus approves and pays, says no, or grants a **One-Time Purchase Authorization**. |
| Limits | Per category, e.g. medical devices under $100 | Small per-item budgets, plus $30 a week and $100 a month | Target budgets; anything over is flagged |

All three run end to end in this build. Switch between them with the tabs on `/demo`, or the
switch at the bottom of the shopper app.

### One-Time Purchase Authorization (personal shopper)

Marcus can say: *"Find these exact shoes, size 10, for $100 or less. You can buy one pair."*

1. **Marcus approves a PayPal hold of $100.** It's for this one product, with an expiry date he
   picks (at most 29 days).
2. **Priya finds them for $89.** ShopperRelay checks that it's the same product (same catalog
   listing, or the same brand and model number), at or under the price, and not expired.
3. **PayPal captures exactly $89** from the hold as the final capture, so PayPal itself releases
   the other $11 and refuses any second purchase.
4. **Substitutions and higher prices need a new approval.** An expired or canceled authorization
   voids the hold.

## Try it in three minutes

1. Open **/demo**. Mom's screen is on the left, Sarah's phone on the right.
2. **Mom shops.** Search *blood pressure monitor*. Each result shows what it's *counted as*
   (from the store's own category) and whether Mom can buy it herself. Choose one under $100 and
   pay: PayPal holds it, checks the amount, and completes it.
3. **Check a checkout.** Use the example *"Monitor with a membership in the small print"*. The AI
   finds the hidden $39/month membership. Buy it: PayPal holds the money and Sarah's phone shows
   the request. She approves (captured) or declines (hold released).
4. **Mom's rules, in her words.** On *My rules*, write *"Under $75 I decide. Over $150 Sarah
   decides."* The app asks about $75–$150 and won't save until it's answered. Try *"I can buy
   cars under $10,000"* (a new category) or *"Video games go to Dad, Tom"* (a second reviewer).
   Loosening a safeguard waits 24 hours or for Sarah's OK.
5. **Kids + parent tab.** Leo searches, sees his budget, and taps *Ask Dana*. Dana's phone shows
   the request with Leo's budget. She approves and pays with PayPal, or says no.
6. **Personal shopper tab.** Priya sends Marcus a find. Marcus taps *Find it for less*, sets his
   price, and approves the hold. Priya sees which stores qualify and buys it at Marcus's price.

**Paying in the sandbox:** log in with a PayPal sandbox personal account, or choose **Debit or
Credit Card** and use the sandbox test card `4111 1111 1111 1111` with any future expiry and any
CVV. **Simulate 24 hours** in the demo controls shows timeouts.

## How it works

```
Search (Channel3) ──or── a checkout screenshot (Gemini reads it)
        │
        ▼
Category from the store's catalog; the owner's own categories; AI only as a fallback.
Any doubt applies the stricter rule.
        │
        ▼
The rules, checked by plain code ──► "You can buy this" / "Sarah takes a look" / "Over budget"
        │
        ├─ Mom's flow: PayPal Orders v2, intent AUTHORIZE → hold → read the amount back from PayPal
        │      → rules again → capture │ Sarah approves: capture, declines: void, 24h: void
        │
        └─ Request flow: Leo/Priya ask → the reviewer approves in PayPal → hold → amount check
               → capture │ or One-Time Purchase Authorization: hold up to the price
               → shopper finds it → partial final capture of the exact price
        │
        ▼
Why log: every step and its reason. PayPal webhooks (signature-verified) confirm.
```

### PayPal

- **Orders v2 with `intent: AUTHORIZE`** and **Payments v2 capture and void.** Approving only places
  a hold, and ShopperRelay decides afterwards whether to capture or void it. That's what makes
  "Sarah takes a look first" possible without ever charging Mom for something that's declined.
- **Partial final capture** for the One-Time Purchase Authorization: hold the customer's maximum,
  capture the actual price, and PayPal releases the rest and blocks a second capture.
- **PayPal's held amount is authoritative.** The app reads the authorization back from PayPal and
  refuses to continue if it differs from what was reviewed by even a cent.
- **Smart Buttons (JS SDK)**, **idempotency keys** on every money-moving call, and **webhooks**
  verified with PayPal's signature-verification API.
- In the prototype ShopperRelay is the sandbox merchant. Placing the order with the store is
  simulated and labelled as such.

### AI (Google Gemini: `gemini-3.5-flash` for rules and checkouts, `gemini-3.5-flash-lite` for quick explanations, each with fallbacks)

What the AI does:

- Turns plain-English rules into structured rules, including new categories ("cars") and reviewers
  ("video games go to Tom").
- Reads checkout screenshots for the real total, recurring charges, trials and cancellation
  terms, and quotes the small print.
- Explains search results in a few short, jargon-free bullets.
- Suggests a category only when the catalog has none.

What the AI never does:

- **Decide a payment.** Deterministic, tested code decides.
- **Override PayPal's amount.**
- **Choose a looser category.** When it isn't sure, the stricter rule applies. A custom category
  only replaces the store's category when the store itself files the product there. A word in the
  title, like "car phone mount", just adds the rule, and the stricter one wins.
- **Find rule gaps or write the questions about them.** Code does both.
- **Call products equivalent** or give medical advice.

Every AI answer is checked against a schema. Calls retry, fall back to other models, and identical
questions reuse a saved answer, so a busy model can't stall a purchase.

### Channel3

- In-app product search, so nobody has to copy links.
- Real prices, stores, stock and catalog categories.
- **Same product** is claimed only when Channel3 groups listings under one product, or the brand
  and model number match exactly. The One-Time Purchase Authorization uses the same check.

## Safeguards

- **Mom writes her own rules.** Sarah only sees purchases Mom's rules send to her.
- **Tightening a rule** takes effect immediately.
- **Loosening a safeguard waits.** That includes changing who reviews a category, or a new category
  that's looser than General Shopping. Sarah is notified and can let it start early; otherwise it
  starts after 24 hours. She can't block it. This stops a scammer pressuring Mom into switching
  protections off on the spot, or making themselves the reviewer.
- **Rules owned by a parent or customer:** their changes apply at once; when the shopper asks for a
  change, it waits for them.
- **Rules with gaps can't be saved.** Any amount not covered by a rule goes to review until it's
  decided.
- **Budgets and caps count anything still waiting** (held payments, open requests, active
  authorizations), so two smaller purchases can't slip past a limit together. Declined, expired and
  canceled ones release their amount.

## What's real and what's simulated

| Real | Simulated |
| --- | --- |
| PayPal sandbox authorize, capture (full and partial), void, webhooks | Placing the order with the store |
| Channel3 product search and prices | Text messages to reviewers (`/inbox` stands in for their phone) |
| Gemini rule parsing, screenshot reading, explanations | Passing time (**Simulate 24 hours**) |
| Neon Postgres storage and the why log | The store in the screenshot examples is made up |

The demo has no sign-in. Each browser gets its own private copy of the three households, so
people testing at the same time never see or reset each other's purchases. **Reset this demo**
starts only your copy over. For the video, **Hide real store and brand names** swaps real store names for invented
ones and blurs product photos.

## Built with

Next.js 16 and TypeScript on Vercel; PayPal Orders v2, Payments v2 and the JS SDK; Google Gemini;
Channel3; Neon Postgres; Tailwind CSS; Vitest. Development was assisted by Claude Code.

## Run it yourself

```bash
npm install
cp .env.example .env.local   # PayPal sandbox app, Channel3, Gemini and Neon keys
npm run db:migrate           # create the tables
npm test                     # unit tests (rules engine, lifecycle, OTPA, AI post-processing, catalog)
npm run dev                  # http://localhost:3000, and /demo
npm run e2e                  # all three flows against the running app and the PayPal sandbox
```

Service checks: `npm run paypal:check`, `npm run channel3:check`, `npm run gemini:check`,
`npm run ai:check`.

## Code map

- `src/lib/policy/`: the rules engine, plain code with no I/O and no AI. Presets for all three
  relationships live in `presets.ts`.
- `src/lib/purchases/`: the purchase lifecycle (both flows, OTPA) and the service that runs it
  against PayPal.
- `src/lib/paypal/client.ts`: Orders v2 / Payments v2, webhook verification.
- `src/lib/ai/`: the Gemini jobs.
- `src/lib/catalog/`: Channel3 adapter, comparisons, demo name hiding.
- `src/lib/store/`, `db/migrations/`: Postgres storage.
- `src/config/relationships.ts`: the three relationships, their roles, flows and wording.
- `src/app/`: screens and the HTTP API (`src/app/api/`).

## License

The code is MIT licensed. The ShopperRelay name and logo (`public/brand/`) are not covered by the
MIT license and may not be used without permission.
