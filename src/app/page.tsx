import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand, VIDEO_ID, videoUrl } from "@/config/brand";
import type { RelationshipId } from "@/config/relationships";
import { FrontNav } from "@/components/FrontNav";
import { TryDemoButton } from "@/components/TryDemoButton";
import { ButtonLink } from "@/components/ui";
import logo from "../../public/brand/shopperrelay-logo-trimmed.png";
import symbol from "../../public/brand/shopperrelay-symbol.png";
import shotAgent from "../../public/prizes/agent.jpg";
import shotAgGrid from "../../public/prizes/aggrid.jpg";
import shotBryntum from "../../public/prizes/bryntum.jpg";
import shotChannel3 from "../../public/prizes/channel3.jpg";
import shotPayPal from "../../public/prizes/paypal.jpg";

// The front page: what ShopperRelay is, who it's for, and what it's built on,
// for anyone arriving cold (judges included). The app itself lives at /shop.

const LINE = "Shopping help from someone you trust, with rules made to fit you.";
const REPO = "https://github.com/YzSolutions/shopper-relay";

export const metadata: Metadata = { title: { absolute: `${brand.name}: ${LINE}` } };

/** One purchase, followed through the four stops of the relay. */
const RELAY: Array<{ stop: string; text: string; dot: string }> = [
  { stop: "AI understands", text: "Gemini reads the small print: this includes a $39-a-month membership.", dot: "bg-relay" },
  { stop: "Rules enforce", text: "Mom's rule says any subscription goes to Sarah first.", dot: "bg-signal" },
  { stop: "People approve", text: "Sarah sees the same facts and the reason for asking, then approves from a phone.", dot: "bg-relay-deep" },
  { stop: "PayPal executes", text: "PayPal was holding $149.00 the whole time. Now it's captured.", dot: "bg-ledger" },
];

const SETUPS: Array<{ mode: RelationshipId; name: string; who: string; shops: string; rules: string; pays: string; how: string }> = [
  {
    mode: "family_elder",
    name: "Mom + Sarah",
    who: "Sarah and her mom",
    shops: "Mom",
    rules: "Mom's own",
    pays: "Mom",
    how: "Within Mom's rules, a purchase goes straight through. Otherwise PayPal holds the payment while Sarah takes a look. Loosening a rule waits 24 hours, and Sarah can hold it up to 3 days to talk it over, so nobody can pressure Mom out of a safeguard on the spot.",
  },
  {
    mode: "parent_child",
    name: "Leo + Sarah",
    who: "Sarah and her son",
    shops: "Leo",
    rules: "Sarah's",
    pays: "Sarah, or Marcus for video games and tech",
    how: "Leo asks. Sarah sees the request next to Leo's weekly and monthly budget, then pays with Sarah's own PayPal or says no. Video games and tech go to Marcus. Leo never needs a parent's login.",
  },
  {
    mode: "personal_shopper",
    name: "Priya + Marcus",
    who: "Sarah's husband and his paid shopping assistant",
    shops: "Priya",
    rules: "Marcus's",
    pays: "Marcus",
    how: "Priya shops online, Marcus decides: approve and pay, let Priya or the AI shopper buy one exact item once at a price Marcus sets, or save PayPal once so Priya can buy what Marcus's rules allow. Priya bills for the time spent with a PayPal invoice.",
  },
  {
    mode: "ai_shopper",
    name: "AI Shopper + Sarah",
    who: "Sarah and the AI that shops for her",
    shops: "The AI",
    rules: "Sarah's",
    pays: "Sarah",
    how: "Sarah writes a rule and saves PayPal once. Give the AI a job: within the rule it buys, and anything else goes to Sarah first. Code checks the rules on every listing, so the AI can't buy outside them.",
  },
];

const AGENT: Array<{ title: string; text: string }> = [
  { title: "Gemini plans the hunt", text: "What to search for, which listing to pick and why, in words Marcus can read." },
  { title: "Code checks every listing", text: "Same product, at or under the price, in stock, not expired. A listing code hasn't allowed can't be bought." },
  { title: "PayPal sets the ceiling", text: "It holds Marcus's maximum, can't capture more than that, and refuses a second capture." },
  { title: "Every step is on the record", text: "The purchase log shows what it searched, what it picked and what it paid." },
];

const PAYPAL: Array<{ name: string; what: string }> = [
  { name: "Orders v2, intent AUTHORIZE", what: "Places a hold instead of a charge, so someone can take a look before any money moves." },
  { name: "Payments v2 capture and void", what: "Approving captures the hold. Declining, or 24 hours with no answer, voids it. Nothing is charged for a purchase that doesn't happen." },
  { name: "Partial final capture", what: "A one-time purchase authorization holds $100 for one exact product, then captures the $89 it really cost. PayPal releases the rest and refuses a second capture." },
  { name: "Vault setup and payment tokens", what: "Standing permission: Marcus saves PayPal once, and Priya can buy what Marcus's rules allow without asking each time. It can be turned off at any moment." },
  { name: "Invoicing v2", what: "Priya bills Marcus for the time spent, and Marcus pays on PayPal's own invoice page." },
  { name: "JavaScript SDK buttons", what: "The PayPal buttons and popups people approve with, including saving PayPal for later." },
  { name: "Authorization read-back", what: "Before capturing, the held amount is read back from PayPal and the rules run again on it. If it's off by even a cent, nothing is captured." },
  { name: "Verified webhooks", what: "PayPal's events confirm each step, and each one is checked with PayPal's signature verification." },
  { name: "Idempotency keys", what: "Every call that moves money carries a PayPal-Request-Id, so a retry can never pay twice." },
];

const AI_DOES = [
  "Turns rules written in plain words into exact rules, including new categories (“I can buy cars under $10,000”) and extra reviewers (“video games go to Marcus”).",
  "Reads a checkout screenshot for the real total, repeat charges and free trials, and quotes the small print.",
  "Boils a long, chatty search down to what to look for, and sums up the results in plain words.",
  "Suggests a category, but only when the store's catalog doesn't have one.",
  "Runs the AI shopper: searches stores for the product Marcus authorized and picks a listing to buy.",
];

const AI_NEVER = [
  "Decide whether a payment goes through. Tested code does that.",
  "Change the amount PayPal is holding, or buy a listing code hasn't allowed.",
  "Pick the looser of two categories. When it's unsure, the stricter rule applies.",
  "Decide what the rules leave out. Code finds every gap and asks about it before the rules can be saved.",
];

const CHANNEL3 = [
  { title: "Search without copying links", text: "Real products, prices, stores and stock, found right inside the app." },
  { title: "The store's category decides the rule", text: "Channel3's catalog category says a blood pressure monitor is a medical device, so the medical rule applies, not a guess." },
  { title: "Every store for one product", text: "Offers from different stores sit under one product, cheapest in stock first." },
  { title: "“Same product” you can trust", text: "Channel3's product grouping is what lets a one-time authorization say yes to the same item at another store, and no to anything else." },
  { title: "Price limits that stick", text: "“Under $200” in a search becomes a Channel3 price filter, not a hope." },
];

/** The hackathon's prize tracks we built for, each with a screen from the live demo (names hidden, as in the video). */
const PRIZES: Array<{
  prize: string;
  title: string;
  points: string[];
  shot: StaticImageData;
  alt: string;
  /** Tall phone-style screens get a narrower frame. */
  tall?: boolean;
  mode: RelationshipId;
  tryLabel: string;
}> = [
  {
    prize: "Best Use of PayPal + AI",
    title: "PayPal holds the money while a person decides",
    points: [
      "Gemini turns rules written in plain words into exact rules, and reads the small print on any checkout, like a free trial that becomes $39 a month.",
      "When a purchase needs a second look, PayPal holds the exact amount instead of charging it. Approving captures it. Declining, or no answer, releases it.",
      "A one-time limit holds a maximum and captures only what the item cost. PayPal releases the rest and refuses a second capture.",
      "Saved PayPal (Vault) lets a trusted shopper buy within the rules, and PayPal invoices bill for a personal shopper's time.",
    ],
    shot: shotPayPal,
    alt: "Sarah's phone: PayPal is holding $149.00 for Mom's purchase, with Approve and Decline, and a cheaper option within Mom's own rules.",
    tall: true,
    mode: "family_elder",
    tryLabel: "Try Mom + Sarah",
  },
  {
    prize: "Best Use of Agentic Commerce",
    title: "An AI shopper that can only buy inside your rules",
    points: [
      "Give it a job in plain words. Gemini plans the search, picks a listing and says why in one sentence.",
      "Code checks every listing against the owner's rules before the AI can choose it, so it can't buy outside them.",
      "Within the rules it pays with the owner's saved PayPal. Anything else becomes a request the owner approves.",
      "Every step is on the record: what it searched, what it chose and what PayPal charged.",
    ],
    shot: shotAgent,
    alt: "What the AI shopper did: searched stores for a modern desk clock, chose one, and bought it for $21.99 within Sarah's rules.",
    mode: "ai_shopper",
    tryLabel: "Try the AI Shopper",
  },
  {
    prize: "Best Use of Channel3",
    title: "Real products, and the facts the rules need",
    points: [
      "Real products, prices, stores and stock, searched right inside the app.",
      "Channel3's catalog category decides which rule applies: a blood pressure monitor counts as a medical device.",
      "Its product grouping is what lets a one-time limit say yes to the same product at another store, and no to anything else.",
      "“Under $200” in a search becomes a Channel3 price filter, and Gemini sums up the results in plain words.",
    ],
    shot: shotChannel3,
    alt: "Search results for a blood pressure monitor, each counted as a medical device and checked against Mom's rules.",
    mode: "family_elder",
    tryLabel: "Search as Mom",
  },
  {
    prize: "Best Use of AG Grid",
    title: "Everything on Sarah's PayPal, in one table",
    points: [
      "One table per PayPal account, across every relationship: Leo's requests Sarah paid or declined, her AI shopper's buys, and her own shopping. What Marcus pays for shows on his.",
      "What was bought, who it was for, what PayPal charged, its status, who decided and the PayPal ID.",
      "Sort, filter by text, number and date, and search.",
      "A pinned total of what was paid in the last 30 days.",
      "Download as CSV for records or taxes. On a phone it keeps the date, item and amount.",
    ],
    shot: shotAgGrid,
    alt: "Sarah's PayPal table on History: her own comforter set, the clock her AI shopper bought, and Leo's hoodies, one paid and one declined, with who each was for, the amount, status, who decided, PayPal ID and the 30-day total.",
    mode: "self",
    tryLabel: "Try Sarah's own tab",
  },
  {
    prize: "Best Use of Bryntum",
    title: "Occasions the AI shops ahead of",
    points: [
      "Sarah puts birthdays, holidays and the office Secret Santa on a Bryntum calendar, each with a job for the AI.",
      "A few days before each date, the AI shops for it on its own, within her rules and saved PayPal.",
      "The calendar marks each date and the day the AI shops, coloured by how it went: bought, waiting for Sarah, or nothing found.",
    ],
    shot: shotBryntum,
    alt: "Sarah's Occasions calendar for November: Leo's and Mom's birthdays and the office Secret Santa, with a green cart where the AI already bought the Secret Santa gift.",
    mode: "ai_shopper",
    tryLabel: "Try the AI Shopper",
  },
];

/** Each figure was read at its source (November 2026); keep the links so anyone can check. */
const WHY: Array<{ figure: string; text: string; source: string; href: string }> = [
  {
    figure: "63 million",
    text: "American adults are family caregivers, and 81% of them help with grocery or other shopping.",
    source: "AARP and National Alliance for Caregiving, 2025",
    href: "https://www.aarp.org/pri/topics/ltss/family-caregiving/caregiving-in-the-us-2025/",
  },
  {
    figure: "$2.4 billion",
    text: "in fraud losses reported by adults 60 and older in 2024, up from about $600 million in 2020. They filed more loss reports on online shopping than on any other kind of fraud.",
    source: "US Federal Trade Commission, 2025",
    href: "https://www.ftc.gov/system/files/ftc_gov/pdf/P144400-OlderAdultsReportDec2025.pdf",
  },
  {
    figure: "Up to $1 trillion",
    text: "in US retail revenue could be orchestrated by AI agents by 2030. Each agent will need permission to spend someone's money.",
    source: "McKinsey, 2025",
    href: "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-agentic-commerce-opportunity-how-ai-agents-are-ushering-in-a-new-era-for-consumers-and-merchants",
  },
];

const STACK = ["PayPal REST APIs", "PayPal JavaScript SDK", "Google Gemini", "Channel3", "AG Grid", "Bryntum Calendar", "Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "Neon Postgres", "Vercel", "Zod", "Vitest"];

const NAV = [
  { href: "#setups", label: "Who it's for" },
  { href: "#prizes", label: "Hackathon" },
  { href: "#agent", label: "AI shopper" },
  { href: "#paypal", label: "PayPal" },
  { href: "#ai", label: "AI" },
  { href: "#channel3", label: "Channel3" },
];

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-line py-16 md:py-20">
      <div className="max-w-2xl">
        <h2 id={`${id}-title`} className="text-[2rem] font-extrabold md:text-[2.5rem]">
          {title}
        </h2>
        {lead && <p className="mt-4 text-xl text-ink-soft">{lead}</p>}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function FrontPage() {
  return (
    <div className="min-h-dvh">
      {/* Stays at the top while the page scrolls, so the sections are always a tap away. */}
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-x-3 px-5 py-3 sm:gap-x-6">
          {/* Already home, so the logo goes back to the top ("#top" always scrolls there); a link to "/" would do nothing. */}
          <a href="#top" aria-label={`${brand.name}: back to the top`} className="shrink-0">
            {/* On a phone, just the symbol, so Test script, Live demo and Menu all fit beside it. */}
            <Image src={symbol} alt={brand.name} priority className="size-9 sm:hidden" />
            <Image src={logo} alt={brand.name} priority className="hidden h-11 w-auto sm:block" />
          </a>
          <FrontNav links={NAV} />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-5">
        <section className="grid items-center gap-12 pt-10 pb-20 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <h1 className="text-[2.5rem] leading-[1.08] font-extrabold tracking-[-0.03em] md:text-[3.5rem]">{LINE}</h1>
            <p className="mt-6 max-w-xl text-xl text-ink-soft md:text-[1.375rem]">
              Write the rules in plain words. {brand.name} checks every purchase against them, brings in the right person when the rules say so, and PayPal
              holds the money until it&apos;s settled.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/demo">Try the live demo</ButtonLink>
              <ButtonLink href="/shop" tone="quiet">
                Open the shopping app
              </ButtonLink>
            </div>
            <p className="mt-5 text-base text-ink-soft">Runs on the PayPal sandbox. No sign-in, and every visitor gets a private copy of the demo.</p>
          </div>

          <figure className="rounded-3xl border-2 border-line bg-white p-6 shadow-[0_24px_60px_-30px_rgba(1,62,163,0.35)] md:p-8">
            <div className="rounded-2xl bg-mist p-5">
              <p className="text-base text-ink-soft">A checkout Mom found on another site</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="text-xl font-bold">Blood pressure monitor</p>
                <p className="text-xl font-bold tabular-nums">$149.00</p>
              </div>
              <p className="mt-3 border-l-4 border-signal pl-3 text-base italic">&ldquo;Then $39 every month after your 30-day free trial.&rdquo;</p>
            </div>
            <ol className="relative mt-6 space-y-5 pl-9 before:absolute before:top-2 before:bottom-2 before:left-[0.6875rem] before:w-0.5 before:bg-line">
              {RELAY.map((r, i) => (
                <li key={r.stop} className="relative">
                  <span
                    aria-hidden
                    className={`relay-dot absolute top-1.5 -left-9 size-6 rounded-full border-4 border-white ${r.dot}`}
                    style={{ animationDelay: `${200 + i * 450}ms` }}
                  />
                  <p className="font-bold">{r.stop}</p>
                  <p className="text-ink-soft">{r.text}</p>
                </li>
              ))}
            </ol>
            <figcaption className="sr-only">One purchase going through {brand.name}: AI understands, rules enforce, people approve, PayPal executes.</figcaption>
          </figure>
        </section>

        <section id="video" aria-labelledby="video-title" className="scroll-mt-20 pb-16 md:pb-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="video-title" className="text-[2rem] font-extrabold md:text-[2.5rem]">
              Watch it in 3 minutes
            </h2>
            <p className="text-lg text-ink-soft">
              Every claim, step by step:{" "}
              <Link href="/walkthrough" className="font-semibold text-relay underline underline-offset-4">
                the test script
              </Link>
            </p>
          </div>
          {/* youtube-nocookie: nothing from YouTube loads cookies until someone presses play. */}
          <div className="mt-8 aspect-video overflow-hidden rounded-3xl border-2 border-line bg-ink shadow-[0_24px_60px_-30px_rgba(1,62,163,0.35)]">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`}
              title={`${brand.name} demo video`}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="size-full"
            />
          </div>
          <p className="mt-3 text-base text-ink-soft">
            English subtitles: press CC in the player.{" "}
            <a href={videoUrl()} className="font-semibold text-relay underline underline-offset-4">
              Open it on YouTube
            </a>
          </p>
        </section>

        <Section
          id="problem"
          title="Helping someone shop is usually all or nothing"
          lead={`An older parent is left alone with confusing checkouts, free trials that turn into memberships and pressure scams, or someone takes over their money. A child borrows a parent's login. A personal shopper gets a card with no limit, or waits for a yes on every find. ${brand.name} sits in between.`}
        >
          <p className="max-w-2xl text-xl">
            Written rules decide what can be bought straight away and what someone else sees first. PayPal makes sure no money moves until it should.
          </p>
          <dl className="mt-12 grid gap-x-10 gap-y-9 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.figure}>
                <dt className="text-[2rem] leading-tight font-extrabold text-relay-deep">{w.figure}</dt>
                <dd className="mt-2">
                  {w.text}{" "}
                  <a href={w.href} target="_blank" rel="noopener noreferrer" className="block pt-2 text-base text-ink-soft underline underline-offset-4 hover:text-ink">
                    {w.source}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="setups" title="One engine, four relationships" lead="Everybody in Sarah's life needs something. Each of these is a working demo, with its own rules and way of paying.">
          <div className="grid gap-6 md:grid-cols-2">
            {SETUPS.map((s) => (
              <article key={s.mode} className="flex flex-col rounded-2xl border-2 border-line p-6">
                <h3 className="text-2xl font-bold">{s.name}</h3>
                <p className="text-ink-soft">{s.who}</p>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
                  <dt className="text-ink-soft">Shops</dt>
                  <dd className="font-semibold">{s.shops}</dd>
                  <dt className="text-ink-soft">Rules</dt>
                  <dd className="font-semibold">{s.rules}</dd>
                  <dt className="text-ink-soft">Pays</dt>
                  <dd className="font-semibold">{s.pays}</dd>
                </dl>
                <p className="mt-5 flex-1">{s.how}</p>
                <TryDemoButton mode={s.mode} className="mt-6 self-start">
                  Try {s.name}
                </TryDemoButton>
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="prizes"
          title="What we built for each prize"
          lead={`The PayPal AI Hackathon has prizes for the best use of each sponsor's tools. Here's how ${brand.name} uses every one, with a screen from the live demo.`}
        >
          <div className="space-y-20">
            {PRIZES.map((p, i) => (
              <article key={p.prize} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                <div className={i % 2 ? "lg:order-2" : undefined}>
                  <p className="font-bold text-relay">{p.prize}</p>
                  <h3 className="mt-1 text-[1.75rem] leading-tight font-extrabold">{p.title}</h3>
                  <ul className="mt-5 space-y-3">
                    {p.points.map((t) => (
                      <li key={t} className="border-l-4 border-line pl-4">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <TryDemoButton mode={p.mode} className="mt-6">
                    {p.tryLabel}
                  </TryDemoButton>
                </div>
                <Image
                  src={p.shot}
                  alt={p.alt}
                  sizes="(min-width: 1024px) 34rem, 100vw"
                  className={`w-full rounded-2xl border-2 border-line shadow-[0_24px_60px_-30px_rgba(1,62,163,0.35)] ${p.tall ? "mx-auto max-w-[22rem]" : ""}`}
                />
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="agent"
          title="The same permission works for an AI shopper"
          lead="AI agents can already shop. The hard part is trusting one with your money. Here, Marcus authorizes one exact product at a set price, and PayPal holds that amount. The AI shopper can search and choose, but it can only buy inside that permission."
        >
          <ul className="grid gap-x-10 gap-y-7 md:grid-cols-2">
            {AGENT.map((a) => (
              <li key={a.title} className="border-l-4 border-relay pl-4">
                <p className="font-bold">{a.title}</p>
                <p className="mt-1 text-ink-soft">{a.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-2xl">
            To try it, open Priya + Marcus, send Marcus a find, and on Marcus&apos;s phone choose to let Priya buy it once. Then tap Send the AI shopper.
          </p>
          <TryDemoButton mode="personal_shopper" className="mt-5">
            Try the AI shopper
          </TryDemoButton>
        </Section>

        <Section
          id="paypal"
          title="What PayPal does here"
          lead="PayPal isn't just the checkout button. Holding money while a person decides is what makes the whole idea safe, for both sides."
        >
          <dl className="divide-y divide-line border-y border-line">
            {PAYPAL.map((p) => (
              <div key={p.name} className="grid gap-1 py-5 md:grid-cols-[18rem_1fr] md:gap-8">
                <dt className="font-bold">{p.name}</dt>
                <dd className="text-ink-soft">{p.what}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="ai" title="Gemini explains. Code decides." lead="AI does the understanding. It never holds the purse strings.">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-relay-wash p-6">
              <h3 className="text-xl font-bold text-relay-deep">What the AI does</h3>
              <ul className="mt-4 list-disc space-y-3 pl-5">
                {AI_DOES.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-mist p-6">
              <h3 className="text-xl font-bold">What it never does</h3>
              <ul className="mt-4 list-disc space-y-3 pl-5">
                {AI_NEVER.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-ink-soft">
            Every AI answer is checked against a schema before it&apos;s used. If one Gemini model is slow, a second one starts and the first good answer wins, and
            answers to the same question are reused, so a busy model can&apos;t hold up a purchase.
          </p>
        </Section>

        <Section id="channel3" title="Real products from Channel3" lead="The rules are only as good as what they know about the product. Channel3 supplies the facts.">
          <ul className="grid gap-x-10 gap-y-7 md:grid-cols-2 lg:grid-cols-3">
            {CHANNEL3.map((c) => (
              <li key={c.title} className="border-l-4 border-ledger pl-4">
                <p className="font-bold">{c.title}</p>
                <p className="mt-1 text-ink-soft">{c.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="built"
          title="Built with"
          lead="Over 100 unit tests cover the rules engine and the purchase steps, and an end-to-end test runs all four setups against the PayPal sandbox."
        >
          <ul className="flex flex-wrap gap-2">
            {STACK.map((s) => (
              <li key={s} className="rounded-lg border-2 border-line px-3 py-1.5 font-semibold">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      </main>

      <section aria-labelledby="try-title" className="bg-relay text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-5 py-16">
          <div className="max-w-2xl">
            <h2 id="try-title" className="text-[2rem] font-extrabold">
              See it work in three minutes
            </h2>
            <p className="mt-3 text-xl text-white/85">
              The demo puts the shopper&apos;s screen next to the reviewer&apos;s phone. Search, buy, approve, and watch PayPal settle it.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex min-h-13 items-center rounded-xl bg-white px-6 py-3 text-lg font-semibold text-relay-deep hover:bg-relay-wash"
            >
              Open the live demo
            </Link>
            <Link
              href="/walkthrough"
              className="inline-flex min-h-13 items-center rounded-xl border-2 border-white/60 px-6 py-3 text-lg font-semibold hover:border-white"
            >
              Test script for judges
            </Link>
            <a
              href={REPO}
              className="inline-flex min-h-13 items-center rounded-xl border-2 border-white/60 px-6 py-3 text-lg font-semibold hover:border-white"
            >
              Source code
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-mist">
        <div className="mx-auto max-w-6xl px-5 py-6 text-base text-ink-soft">
          Built by InDigitual for the PayPal AI Hackathon. The code is MIT licensed. Payments run in the PayPal sandbox, so no real money moves.{" "}
          <Link href="/walkthrough" className="font-semibold text-relay underline underline-offset-4">
            Test script
          </Link>{" "}
          <Link href="/privacy" className="font-semibold text-relay underline underline-offset-4">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
