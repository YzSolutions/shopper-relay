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

### Who it's for, and why it matters

- **Family caregivers.** 63 million American adults are family caregivers, and 81% of them help with grocery
  or other shopping ([AARP and National Alliance for Caregiving, 2025](https://www.aarp.org/pri/topics/ltss/family-caregiving/caregiving-in-the-us-2025/)).
- **Older shoppers.** Adults 60 and older reported about $2.4 billion in fraud losses in 2024, up from about
  $600 million in 2020, and filed more loss reports on online shopping than on any other kind of fraud
  ([FTC](https://www.ftc.gov/system/files/ftc_gov/pdf/P144400-OlderAdultsReportDec2025.pdf)). The FBI counted $7.7 billion in losses from 201,266 complaints by people 60 and older in 2025
  ([FBI IC3](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf)).
- **Parents and anyone who pays someone to shop for them.** They face the same choice between no limits and
  answering every request.
- **Anyone letting an AI agent shop.** The US retail market could see up to $1 trillion in revenue orchestrated
  by AI agents by 2030 ([McKinsey](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-agentic-commerce-opportunity-how-ai-agents-are-ushering-in-a-new-era-for-consumers-and-merchants)), and each agent needs a way to be given permission to spend.

ShopperRelay works at the moment of buying: the hidden membership, the pressure to switch a safeguard off, the
purchase that deserves a second look. It isn't a cure for all of those losses. The largest share goes to
investment scams, which happen outside a shopping checkout.

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
- **Kids + parent.** Leo browses and taps "Ask Sarah". Sarah sees the request and Leo's weekly and monthly
  budget, then approves and pays with Sarah's own PayPal or says no. Video games and tech go to Leo's dad,
  Marcus, on Marcus's own tab. Open requests reserve budget; declined ones release it. Subscriptions are blocked.
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

## Video script (target about 2:40, hard limit 3:00)

One person's life. Sarah is the one everybody needs: Mom asks Sarah, Leo asks Sarah, video games and tech go to
Leo's dad Marcus, and Marcus has Priya, a paid shopping assistant, finding him a suit. The drawn scenes are the
story, and every shot that claims the product works is the real product.

It covers the judging points: what problem, who it's for, why it matters, the project working end to end, and how
PayPal and AI are used.

**Order of work:**

1. Finish every site change, because the footage is locked after this.
2. Record the PayPal clips (see below).
3. Capture and lock one full take. No deploys until submission.
4. Match the words to that take, then record the narration in one sitting.
5. Cut the picture to the voice.

**Before recording:**

- Open https://www.shopperrelay.com/demo. On **each** of the three tabs, click **Reset this demo** and tick
  **Hide real store and brand names**. Then click **Hide the tour**. Search again after ticking, because results
  already on screen keep their names.
- Run the checkout example once first, so its saved answer makes it instant on camera.
- Record at 1920×1080 or higher, browser zoom 100–110%.

**Trademarks (the rules don't allow third-party ones without permission):**

- Hiding names removes store and brand names, but **not model names**, so choose plain-named products. Checked on
  4 Nov 2026, and the catalog changes, so check on the day:
  - Suit: *Mens Navy Suit* ($179.99) or *Men's Navy Blue Suit* ($199). One store each.
  - Tech for Marcus: *Gaming Headset* ($89.99). Controllers mostly carry console names, so avoid them.
- Say "the AI" in the video. Name the model in the Devpost text, which asks for the tools used.
- Don't show the front page: its hero card names the model.
- PayPal and Channel3 are the hackathon's own sponsors, so their names stay.
- Music must be licensed or CC0. Keep the proof.

| Type | Picture | Say |
| --- | --- | --- |
| Drawn | Sarah, busy and smiling, phone buzzing. | "This is Sarah. Sarah has a good life, and everybody in it needs her." |
| Drawn | Mom at the kitchen table. | "Today, Mom's buying a blood pressure monitor." |
| Real | `public/demo/checkout-membership.png`, zooming in on the grey small print under **Place order**. No music yet. | "It says $149. But down here, in the small print: $39 a month." |
| Caption | *AARP and National Alliance for Caregiving, 2025.* Music comes in. | "63 million Americans are family caregivers. Most of them help with shopping." |
| Real | /demo, Mom + Sarah. **Check a checkout**, the membership example. Point at the quoted small print and the reasons. | "ShopperRelay reads the small print. Then Mom's own rules decide, in plain code. Subscriptions go to Sarah." |
| Real | **Buy it through ShopperRelay**, then your PayPal clip. Sarah's phone: scroll the facts, tap **Approve**. The track reaches **Paid**. | "PayPal holds the money. Nothing's charged. Sarah sees the facts and decides. No answer in a day, and the hold is released." |
| Drawn, then real | Leo. Then the Kids tab: Leo taps **Ask Sarah**, and Sarah's phone shows it next to the budget. Sarah pays. | "Leo asks Sarah for things. She sees each request next to his budget, and pays with PayPal. He never needs her login." |
| Drawn, then real | `6-marcus-leo`. Then Leo asks for a gaming headset, and it lands on the **Marcus** tab of the phone. | "But video games and tech? Those go to Dad." |
| Drawn | `4-marcus-meeting`, then `1-fitting-wide`: Priya holds a jacket up to Marcus. | "Marcus has his own problem: he needs a suit, and has no time. Sarah got him started with Priya, a paid shopping assistant." |
| Drawn, then real | `2-swatches`. Then the Personal shopper tab: Priya sends the suit. | "Priya finds the right one. Marcus decides." |
| Real | Marcus's phone: **Let Priya buy it once, up to a price I set**. Set a price above the listed price, then your PayPal clip. | "He says: buy this one suit, once, up to this price. PayPal holds that much." |
| Real | Priya's screen: **Send the AI shopper**, then **What the AI shopper did**. | "Now an AI shopper finds where to buy it. It can't buy anything else: code checks every listing, and the hold is the ceiling." |
| Real | What PayPal charged and released. Hold it, with music only. | *(Two or three seconds, no narration.)* |
| Real, then drawn | The result, then `3-lapel-payoff`: Priya straightens the lapel. Priya's bill, if time allows. Caption: *Orders AUTHORIZE, capture, void, partial capture, Vault, Invoicing, webhooks*. | "PayPal charged what it actually cost, and released the rest. One suit, once. And Priya's time? A PayPal invoice." |
| Drawn | Sarah at home in the same kitchen, phone quiet. | "AI understands. Rules enforce. People approve. PayPal executes." |
| Logo | `public/brand/shopperrelay-logo.png` and shopperrelay.com. | "ShopperRelay.com. Sarah's still busy. Just not with this." |

**Notes:**

- Amounts other than the fixed $149 and $39 example stay on screen, not in the narration, so a different take can't
  make the words wrong.
- Marcus's price must be above the listed price, or PayPal has nothing to visibly release.
- Drawn scenes are illustrations, so no phone or laptop screen shows in them.
- The AI shopper sometimes searches first and sometimes buys straight away. Both fit the words. Don't say it hunts
  the whole web.
- If it runs long, cut the invoice line first, then shorten Leo's scene.
- Judges aren't required to watch past 3:00. Check the final length before uploading to YouTube as public.
