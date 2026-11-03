# ShopperRelay: Devpost submission and video script

Draft text for the Devpost page and a shot-by-shot script for the video (under 3 minutes).
Edit freely; the facts below match what the app does.

---

## Devpost page

**Tagline:** Shopping help from someone you trust, with rules made to fit you. AI understands, rules
enforce, people approve, PayPal executes.

**Try it:** https://www.shopperrelay.com/demo (guided tour built in, no sign-in, PayPal sandbox only).
In PayPal's window, choose Debit or Credit Card and use the sandbox test card 4111 1111 1111 1111,
any future expiry, any CVV.

### Inspiration

When an older parent starts to struggle with online shopping, families usually get two bad choices:
leave them alone with confusing checkouts, trial memberships and pressure scams, or take over their
money. A child has the same problem in reverse: borrow a parent's login, or ask about every small
thing. So does anyone paying a personal shopper: hand over a card with no limit, or answer every find.

Helping someone shop is usually all or nothing. We wanted the middle: written rules that decide what
can be bought straight away and what someone else sees first, with PayPal making sure no money moves
until it should. Then we noticed AI agents have exactly the same problem. The hard part isn't getting an
agent to shop. It's trusting one with your money.

### What it does

- **Shop in one place.** Search in plain words. Real products come from Channel3, and each one shows what
  it counts as and what the rules say will happen. A long, chatty search is boiled down to what to look
  for, and a short plain-language summary explains the options.
- **Check before you buy.** Found something elsewhere? Upload a screenshot of the checkout. The AI reads
  the small print and quotes it, for example "$149 today, then $39 every month after a 30-day free trial".
- **Rules in plain words.** "I can buy clothes under $80 and medical devices under $100. Any subscription
  goes to Sarah." The AI structures it, and you see what it understood before anything changes. Code, not
  AI, finds gaps: replace the rules with "under $75 me, over $150 Sarah" and the app asks about $75 to
  $150 and won't save until it's answered.
- **PayPal holds, then settles.** Within Mom's rules, a payment is captured straight away. Otherwise Sarah
  gets a simple mobile page with the same facts, the reason for asking, and the amount PayPal is holding.
  Approve captures; decline or no answer within 24 hours voids the hold. Nothing is charged unless the
  purchase goes through.
- **Scam-resistant rule changes.** Tightening is instant. Loosening a safeguard, including changing who
  reviews something, tells Sarah and only starts after 24 hours, unless Sarah approves sooner. Sarah can't
  block it: these are Mom's rules. Every change is kept in a rule history no one can edit.
- **Kids + parent.** Leo browses and taps "Ask Dana". Dana sees the request and Leo's weekly and monthly
  budget, then approves and pays with Dana's own PayPal or says no. Open requests reserve budget; declined
  ones release it. Subscriptions are blocked.
- **Personal shopper + One-Time Purchase Authorization.** Priya finds something for Marcus. Marcus can
  approve and pay, or say "buy this exact product once, for $100 or less, by Friday". That places a PayPal
  hold of $100. When it's found for $89, ShopperRelay checks it's the same product and within the price,
  then captures exactly $89. PayPal releases the rest and refuses a second capture: one product, once.
- **The AI shopper.** The same permission works for an AI agent. Under a one-time authorization, Gemini
  plans the hunt: what to search for, which listing to pick and why. Code checks every listing against the
  authorization before Gemini sees it and again before paying, so it can't buy anything Marcus didn't allow,
  and PayPal can't capture more than it holds.
- **Standing permission.** Where the reviewer pays, they can save PayPal once, and the shopper can buy what
  the reviewer's rules allow without asking each time. Every purchase still goes through a hold, an amount
  check and the rules again. It can be turned off at any moment.
- **Bills.** Priya bills Marcus for the time spent, with a PayPal invoice paid on PayPal's own page.
- **Why log.** Every step, and why it happened.

### How we built it

- **Next.js 16, React 19 and TypeScript** on Vercel, with Neon Postgres.
- **PayPal:**
  - Orders v2 with `intent: AUTHORIZE`.
  - Payments v2 capture (full and partial final capture) and void.
  - Vault v3 setup and payment tokens, for standing permission.
  - Invoicing v2, for the personal shopper's bills.
  - JavaScript SDK buttons.
  - Idempotency keys on every money-moving call.
  - Signature-verified webhooks.
- **The rule that matters most:** the amount PayPal is actually holding is read back and must match what
  was reviewed to the cent. The rules run again against that amount before any capture.
- **Google Gemini** for six jobs:
  - Reading rules written in plain words.
  - Reading checkout screenshots.
  - Boiling down long searches.
  - Explaining results.
  - A category fallback.
  - Planning the AI shopper's hunt.

  Every answer is schema-checked and cached. If one model is slow, a second starts and the first good
  answer wins.
- **Channel3** for product search, real prices and stock, and catalog categories that decide which rule
  applies. Its product grouping is what makes "same product" an honest claim, and a stated price limit
  becomes a Channel3 price filter.
- **A deterministic rules engine** with no I/O and no AI, over 100 unit tests, and an end-to-end test that
  runs every flow against the PayPal sandbox.
- **Development assisted by Claude Code.**

### Challenges we ran into

- **Keeping the AI useful without letting it hold the purse strings.** We split the work strictly: AI
  explains and extracts, code decides, PayPal's amount is the truth. Even category choice is guarded. A
  blood pressure monitor misread as "general shopping" could loosen the limit, so any doubt applies the
  stricter rule.
- **Letting an AI agent spend without trusting it.** The agent never decides what's allowed. It only sees
  listings code has already checked, code checks again before paying, and PayPal's hold is a hard ceiling
  no matter what the model says.
- **Giving the reviewer real power without a permanent veto** over another adult's money. The 24-hour
  cooling-off is the answer.
- **Making "same product" an honest claim.** We only say it with catalog grouping or an exact
  brand-and-model match, and the One-Time Purchase Authorization uses the same test.
- **Delegated buying without a blank cheque.** A personal shopper needs to grab a deal fast, but "can spend
  up to $X a week" is too much power. Tying one PayPal hold to one exact product, then capturing only the
  real price, gave speed with a hard ceiling.

### Accomplishments we're proud of

- Every flow runs for real against the PayPal sandbox: authorize, capture, partial capture, void, Vault
  and invoices.
- The AI shopper can't overspend, by construction rather than by prompt.
- The rules engine catches gaps and conflicts before they go live.
- It speaks plainly to someone who isn't comfortable with technology.

### What we learned

- PayPal's authorize-then-capture flow is a natural fit for "ask someone first". The hold makes waiting for
  a reviewer safe for both sides, and a partial final capture turns a hold into a precise, one-time spending
  permission, which is exactly what an AI agent needs too.

### What's next

Real text-message notifications, sign-in, more than one child or customer per household, and more product
sources. In production, ShopperRelay would also need commercial relationships with stores (or to send the
buyer to the store's own PayPal checkout).

### Built with

nextjs, react, typescript, paypal, paypal-orders-api, paypal-vault, paypal-invoicing, gemini, channel3, neon,
postgresql, vercel, tailwindcss, zod, vitest

---

## Video script (target 2:45, hard limit 3:00)

**Before recording:**
- Open https://www.shopperrelay.com/demo, click **Reset this demo** on each of the three tabs, and click **Hide the tour**.
- Tick **Hide real store and brand names**. The rules don't allow third-party trademarks in the
  video; this swaps in invented store names and blurs product photos.
- Have a sandbox buyer login ready, or use **Debit or Credit Card** with the test card.
- Record at 1920×1080, browser zoom 100–110%.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Logo, then /demo split screen | "When Mom needs help shopping, families usually choose between leaving her on her own and taking over her money. ShopperRelay is the middle ground: Mom shops, her own rules decide when her daughter Sarah takes a look, and PayPal holds the money until it's settled." |
| 0:15–0:35 | My rules: tick **Replace all the rules with this**, type *Under $75 I decide. Over $150 Sarah decides.* then **Check what I wrote** | "Mom sets her rules in plain English. The AI structures them, and the engine spots the gap: what about $75 to $150? Nothing ambiguous goes live." |
| 0:35–0:45 | Show the saved rules table | "Her rules: clothing under $80, medical devices under $100, subscriptions always go to Sarah." |
| 0:45–1:05 | Shop: search *blood pressure monitor*, point at "Counted as Medical Devices", green and orange lines, plain-words summary | "Mom shops right here, no copying links. Real products from Channel3. The category comes from the catalog, not a guess, and she sees up front what her rules say." |
| 1:05–1:25 | Choose one under $100, pay with PayPal, relay track runs to **Paid** | "Under her limit: PayPal holds the payment, we check PayPal's amount matches to the cent, and it completes. No one else involved." |
| 1:25–1:50 | Check a checkout: the membership example | "Found something elsewhere? A screenshot is enough. Gemini reads the small print: $149 today, then $39 a month after a free trial. That's a subscription, so Sarah takes a look." |
| 1:50–2:15 | Buy it through ShopperRelay, pay; Mom's screen says "Order placed. Waiting for Sarah"; Sarah's phone lights up; open it, scroll the facts, **Approve** | "Mom has done her part. PayPal is holding the money; nothing's charged yet. Sarah sees exactly what Mom saw, why she's asked, and the amount PayPal is holding. She approves, and PayPal captures." |
| 2:15–2:25 | My rules: loosen a rule; show "A change is waiting"; Sarah's inbox shows it | "If someone pressures Mom to switch a safeguard off, it doesn't happen instantly. Sarah is told, and it starts after 24 hours unless she says yes sooner." |
| 2:25–2:35 | /demo, Kids + parent tab: Leo taps **Ask Dana**; Dana's phone shows his budget; she pays | "The same engine works for kids: Leo asks, Dana sees his budget, and pays with her own PayPal." |
| 2:35–2:50 | Personal shopper tab: Marcus taps **Let Priya buy it once, up to a price I set**, sets $100; on Priya's screen tap **Send the AI shopper**; it buys for less | "And the same permission works for an AI agent: Marcus authorizes one exact product at a set price. PayPal holds it, the AI shopper finds it for less, and only the real price is charged. It can't buy anything else. One product, once." |
| 2:50–2:58 | Logo | "ShopperRelay: AI understands, rules enforce, people approve, PayPal executes." |

**Tips:**
- Record each scene separately and cut them together. Do the screenshot check once before
  recording, so the saved AI answer makes it instant on camera.
- If a PayPal popup is slow, cut the wait.
- Keep the PayPal and Channel3 names visible: they're the hackathon's own sponsors. Hide
  everything else with the toggle.
