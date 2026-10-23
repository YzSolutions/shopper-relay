# ShopperRelay: Devpost submission and video script

Draft text for the Devpost page and a shot-by-shot script for the video (under 3 minutes).
Edit freely; the facts below match what the app does.

---

## Devpost page

**Tagline:** Shopping help you control. AI explains, your rules decide, PayPal holds the money
until it's settled.

### Inspiration

When an older parent starts to struggle with online shopping, families usually get two bad
choices: leave them alone with confusing checkouts, trial memberships and pressure scams, or take
over their money. We wanted a middle ground where Mom stays in charge, gets real help
understanding what she's buying, and decides for herself when her daughter should take a second
look.

### What it does

- **Shop in one place.** Mom searches in plain words ("blood pressure monitor"). Real products
  come from Channel3. Each one shows what it counts as and whether Mom can buy it herself or Sarah
  takes a look first. A short plain-language summary explains the options.
- **Check before you buy.** Found something elsewhere? Upload a screenshot of the checkout. The
  AI reads the small print and quotes it, for example "$149 today, then $39 every month after a
  30-day free trial".
- **Rules in her own words.** "I can buy clothes under $80 and medical devices under $100. Any
  subscription goes to Sarah." The AI structures it. If something isn't covered ("under $75 me,
  over $150 Sarah"), the app asks about the $75–$150 gap and won't save until it's answered.
- **PayPal holds, then settles.** Every purchase is a PayPal authorization. Within Mom's rules,
  it's captured straight away. Otherwise Sarah gets a simple mobile page with the same facts,
  the reason she's asked, and the amount PayPal is holding. Approve captures; decline or no answer
  within 24 hours voids the hold. Nothing is charged unless the purchase goes through.
- **Her own categories and reviewers.** "I can buy cars under $10,000" creates a Cars category.
  "Video games go to Dad, Tom" sends those to Tom instead of Sarah.
- **Scam-resistant rule changes.** Tightening is instant. Loosening a safeguard, including changing
  who reviews something, tells Sarah and only starts after 24 hours, unless Sarah approves sooner.
  She can't block it: these are Mom's rules.
- **Kids + parent.** Leo browses and taps "Ask Dana". Dana sees the request and Leo's weekly and
  monthly budget, then approves and pays with her own PayPal or says no. Open requests reserve
  budget; declined ones release it. Subscriptions are blocked.
- **Personal shopper + One-Time Purchase Authorization.** Priya finds something for Marcus. Marcus
  can approve and pay, or say "find this exact product for $100 or less, size 10, by Friday". That
  places a PayPal hold of $100. When Priya finds it for $89, ShopperRelay checks it's the same
  product and within the price, then captures exactly $89. PayPal releases the rest and refuses
  a second capture: one product, once.
- **Why log.** Every step, and why it happened.

### How we built it

- **Next.js 16 and TypeScript** on Vercel, with Neon Postgres.
- **PayPal:**
  - Orders v2 with `intent: AUTHORIZE`.
  - Payments v2 capture (full and partial final capture) and void.
  - Smart Buttons.
  - Idempotency keys on every money-moving call.
  - Signature-verified webhooks.
- **The rule that matters most:** the amount PayPal is actually holding is read back and must
  match what Mom reviewed to the cent. The rules run again against that amount before any capture.
- **Google Gemini** for four jobs:
  - Parsing rules.
  - Reading checkout screenshots.
  - Explaining results.
  - A category fallback.

  Every answer is schema-checked, retried, backed by fallback models, and cached.
- **Channel3** for product search, real prices and catalog categories.
- **A deterministic rules engine** with no I/O and no AI, plus 70+ unit tests and an
  end-to-end test that runs all three relationships against the PayPal sandbox.
- **Development assisted by Claude Code.**

### Challenges we ran into

- **Keeping the AI useful without letting it hold the purse strings.** We split the work strictly:
  AI explains and extracts, code decides, PayPal's amount is the truth. Even category choice is
  guarded. A blood pressure monitor misread as "general shopping" could loosen the limit, so any
  doubt applies the stricter rule.
- **Giving the reviewer real power without a permanent veto** over another adult's money. The
  24-hour cooling-off is the answer.
- **Making "same product" an honest claim.** We only say it with catalog grouping or an exact
  brand-and-model match, and the One-Time Purchase Authorization uses the same test.
- **Delegated buying without a blank cheque.** A personal shopper needs to grab a deal fast, but
  "can spend up to $X a week" is too much power. Tying one PayPal hold to one exact product, then
  capturing only the real price, gave speed with a hard ceiling.

### Accomplishments we're proud of

- All three relationships run for real against the PayPal sandbox: authorize, capture, partial
  capture, void.
- The rules engine catches gaps and conflicts before they go live.
- It speaks plainly to someone who isn't comfortable with technology.

### What we learned

- PayPal's authorize-then-capture flow is a natural fit for "ask someone first". The hold makes
  waiting for a reviewer safe for both sides, and a partial final capture turns a hold into a
  precise, one-time spending permission.

### What's next

Real text-message notifications, sign-in, more than one child or customer per household, and more
product sources. In production, ShopperRelay would also need commercial relationships with stores
(or to send the buyer to the store's own PayPal checkout).

### Built with

nextjs, typescript, paypal, paypal-orders-api, gemini, channel3, neon, postgresql, vercel,
tailwindcss, vitest

---

## Video script (target 2:45, hard limit 3:00)

**Before recording:**
- Open https://shopper-relay.vercel.app/demo and click **Reset this demo** on each of the three tabs.
- Tick **Hide real store and brand names**. The rules don't allow third-party trademarks in the
  video; this swaps in invented store names and blurs product photos.
- Have a sandbox buyer login ready, or use **Debit or Credit Card** with the test card.
- Record at 1920×1080, browser zoom 100–110%.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Logo, then /demo split screen | "When Mom needs help shopping, families usually choose between leaving her on her own and taking over her money. ShopperRelay is the middle ground: Mom shops, her own rules decide when her daughter Sarah takes a look, and PayPal holds the money until it's settled." |
| 0:15–0:35 | My rules: type *Under $75 I decide. Over $150 Sarah decides.* then **Check what I wrote** | "Mom sets her rules in plain English. The AI structures them, and the engine spots the gap: what about $75 to $150? Nothing ambiguous goes live." |
| 0:35–0:45 | Show the saved rules table | "Her rules: clothing under $80, medical devices under $100, subscriptions always go to Sarah." |
| 0:45–1:05 | Shop: search *blood pressure monitor*, point at "Counted as Medical Devices", green and orange lines, plain-words summary | "Mom shops right here, no copying links. Real products from Channel3. The category comes from the catalog, not a guess, and she sees up front what her rules say." |
| 1:05–1:25 | Choose one under $100, pay with PayPal, relay track runs to **Paid** | "Under her limit: PayPal holds the payment, we check PayPal's amount matches to the cent, and it completes. No one else involved." |
| 1:25–1:50 | Check a checkout: the membership example | "Found something elsewhere? A screenshot is enough. Gemini reads the small print: $149 today, then $39 a month after a free trial. That's a subscription, so Sarah takes a look." |
| 1:50–2:15 | Buy it through ShopperRelay, pay; Mom's screen says "Order placed. Waiting for Sarah"; Sarah's phone lights up; open it, scroll the facts, **Approve** | "Mom has done her part. PayPal is holding the money; nothing's charged yet. Sarah sees exactly what Mom saw, why she's asked, and the amount PayPal is holding. She approves, and PayPal captures." |
| 2:15–2:25 | My rules: loosen a rule; show "A change is waiting"; Sarah's inbox shows it | "If someone pressures Mom to switch a safeguard off, it doesn't happen instantly. Sarah is told, and it starts after 24 hours unless she says yes sooner." |
| 2:25–2:35 | /demo, Kids + parent tab: Leo taps **Ask Dana**; Dana's phone shows his budget; she pays | "The same engine works for kids: Leo asks, Dana sees his budget, and pays with her own PayPal." |
| 2:35–2:50 | Personal shopper tab: Marcus taps **Find it for less**, sets $100; Priya buys it for $89 | "And for a personal shopper: Marcus authorizes one exact product at his price. PayPal holds $100, Priya finds it for $89, and only $89 is charged. One product, once." |
| 2:50–2:58 | Logo | "ShopperRelay: AI understands, rules enforce, people approve, PayPal executes." |

**Tips:**
- Record each scene separately and cut them together. Do the screenshot check once before
  recording, so the saved AI answer makes it instant on camera.
- If a PayPal popup is slow, cut the wait.
- Keep the PayPal and Channel3 names visible: they're the hackathon's own sponsors. Hide
  everything else with the toggle.
