import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { videoUrl } from "@/config/brand";
import symbol from "../../../public/brand/shopperrelay-symbol.png";

/** "1:35" → 95 */
const seconds = (mmss: string) => mmss.split(":").reduce((t, n) => t * 60 + Number(n), 0);

export const metadata: Metadata = {
  title: "Test script",
  description: "A step-by-step script for checking every claim in the ShopperRelay demo video in the live demo.",
};

// A user-acceptance script for judges: one test per claim in the demo video, in the video's order.
// Keep button names in step with the app (the guided tour in src/config/tour.ts uses the same ones).

type Step = [doThis: React.ReactNode, expect: React.ReactNode];
type Test = { id: string; title: string; video: string; tab: string; claim: string; before?: React.ReactNode; steps: Step[] };

const TESTS: Test[] = [
  {
    id: "UAT-01",
    title: "Mom writes her own rules",
    video: "0:15",
    tab: "Mom + Sarah",
    claim: "Sarah helps Mom write her own shopping rules. Big purchases and subscriptions get a second look.",
    steps: [
      [<>Open the <b>Live demo</b> and choose the <b>Mom + Sarah</b> tab.</>, <>Mom&apos;s app on the left, Sarah&apos;s phone on the right.</>],
      [<>On Mom&apos;s screen, open <b>My rules</b>.</>, <>General shopping: Mom buys on her own under $150, and Sarah takes a look from $150. Subscriptions: Sarah takes a look at any price.</>],
    ],
  },
  {
    id: "UAT-02",
    title: "A hidden subscription is caught",
    video: "0:25",
    tab: "Mom + Sarah",
    claim: "It says $149, but the small print adds $39 a month. ShopperRelay's AI catches it, and Mom's rules bring Sarah in.",
    steps: [
      [<>On Mom&apos;s screen, open <b>Check a checkout</b>.</>, <>Sample checkouts under &ldquo;No screenshot handy? Try one of these&rdquo;. They come from a made-up store, since product search never shows memberships.</>],
      [<>On <b>A checkout with a membership in the small print</b>, tap <b>Check this checkout</b>.</>, <>Within about 20 seconds: &ldquo;This isn&apos;t a one-time purchase. $149.00 today, then $39.00 every month after a 30-day free trial.&rdquo;, the small print quoted, and &ldquo;Sarah takes a look first&rdquo;.</>],
      [<>Tap <b>Buy it through ShopperRelay</b>.</>, <>The purchase page, with the PayPal payment buttons.</>],
    ],
  },
  {
    id: "UAT-03",
    title: "PayPal holds the money; Sarah says no and sends a better option",
    video: "0:35",
    tab: "Mom + Sarah",
    claim: "PayPal is only holding the money, so nothing's charged. Sarah sees the hidden fee, says no, and sends Mom one with no monthly fee.",
    before: "UAT-02 done.",
    steps: [
      [<>Pay with <b>Debit or Credit Card</b> and the test card.</>, <>&ldquo;Sent to Sarah to take a look.&rdquo; PayPal is holding the money, not charging it.</>],
      [<>On Sarah&apos;s phone, open the request.</>, <>The price and the monthly charge, and, after a few seconds, <b>A better option for Mom</b> with a cheaper monitor and no monthly fee.</>],
      [<>Tap <b>Decline and send Mom this one</b>.</>, <>Phone: &ldquo;PayPal released the hold, so nothing was charged.&rdquo; Mom&apos;s screen: &ldquo;Sarah said no this time.&rdquo;, nothing charged, and the monitor Sarah sent.</>],
    ],
  },
  {
    id: "UAT-04",
    title: "A looser rule waits, and Sarah can delay it",
    video: "0:47",
    tab: "Mom + Sarah",
    claim: "If someone pressures Mom to change a rule, it waits. Sarah's told, and can hold it up to 3 days to talk it over.",
    steps: [
      [<>On Mom&apos;s screen, open <b>My rules</b>, write &ldquo;I can buy medical devices up to $500 on my own&rdquo;, and tap <b>Check what I wrote</b>.</>, <>The change, shown before anything is saved.</>],
      [<>Tap <b>Save these rules</b>.</>, <>It starts on its own in 24 hours, or sooner if Sarah says yes. The current rules stay in force until then.</>],
      [<>On Sarah&apos;s phone, go to <b>All requests</b> (if a request is open).</>, <>The change at the top, with <b>Let it start now</b> and <b>Delay for 3 days</b>.</>],
      [<>Tap <b>Delay for 3 days</b>.</>, <>The start moves 3 days out. Mom&apos;s screen says Sarah asked for 3 days to talk it over.</>],
    ],
  },
  {
    id: "UAT-05",
    title: "Leo's electronics request goes to Marcus",
    video: "1:05",
    tab: "Leo + Sarah",
    claim: "Sarah prefers that Dad handle all electronic purchases, so Leo's request goes to Marcus.",
    steps: [
      [<>Choose the <b>Leo + Sarah</b> tab. On Leo&apos;s screen, open <b>Rules</b>.</>, <>Electronics: &ldquo;Reviewed by Marcus&rdquo;.</>],
      [<>Open <b>Shop</b> and search &ldquo;laptop&rdquo;.</>, <>Laptops with prices and stores.</>],
      [<>On one, tap <b>Ask Marcus</b>, then <b>Send to Marcus</b>.</>, <>&ldquo;Sent to Marcus. Waiting for an answer.&rdquo; Leo never sees a PayPal login.</>],
    ],
  },
  {
    id: "UAT-06",
    title: "Marcus decides, next to Leo's budget",
    video: "1:14",
    tab: "Leo + Sarah",
    claim: "Marcus sees it next to Leo's budget and makes the call. Leo never needs a parent's login.",
    before: "UAT-05 done.",
    steps: [
      [<>On the phone, switch the inbox to <b>Marcus</b> and open Leo&apos;s request.</>, <>&ldquo;Leo is asking&rdquo;: the laptop, its price and store, Leo&apos;s weekly and monthly budget, <b>View at store</b>, and <b>Approve with PayPal</b> or <b>Decline</b>.</>],
      [<>Optional: <b>Approve with PayPal</b> and pay with the test card.</>, <>Marcus pays. Leo&apos;s screen shows the answer.</>],
    ],
  },
  {
    id: "UAT-07",
    title: "Priya gets a $200 budget",
    video: "1:25",
    tab: "Priya + Marcus",
    claim: "Sarah and Marcus give Priya a $200 budget to buy without asking.",
    steps: [
      [<>Choose the <b>Priya + Marcus</b> tab. On Priya&apos;s screen, open <b>Rules</b>, write &ldquo;Priya can buy clothing up to $200 without asking&rdquo;, and tap <b>Check what I wrote</b>.</>, <>The new clothing rule, shown before saving.</>],
      [<>Tap <b>Demo: save as Marcus</b>.</>, <>Clothing up to $200: &ldquo;You buy, Marcus pays&rdquo;. It works once Marcus saves his PayPal on his phone; until then the app says Marcus decides.</>],
    ],
  },
  {
    id: "UAT-08",
    title: "Marcus OKs one jacket, up to a price he sets",
    video: "1:35",
    tab: "Priya + Marcus",
    claim: "The jacket is $250, so Priya sends it to Marcus. He OKs this one jacket up to $275, and PayPal holds that much.",
    steps: [
      [<>Open <b>Shop</b> and search &ldquo;sport coat&rdquo; (or &ldquo;running shoes&rdquo;).</>, <>Products with prices. Pick one over $200 to match the video; any one works.</>],
      [<>Tap <b>Request for Marcus</b>, then <b>Send to Marcus</b>.</>, <>&ldquo;Sent to Marcus. Waiting for an answer.&rdquo;</>],
      [<>On Marcus&apos;s phone, open it and tap <b>Let Priya buy it once, up to a price I set</b>.</>, <>A price box and &ldquo;Only this exact product counts.&rdquo;</>],
      [<>Enter a little above the price, tap <b>Continue to PayPal</b>, and pay with the test card.</>, <>Priya&apos;s screen: &ldquo;Marcus said: find it for $… or less.&rdquo; PayPal is holding Marcus&apos;s maximum.</>],
    ],
  },
  {
    id: "UAT-09",
    title: "Priya buys; PayPal charges the real price and releases the rest",
    video: "1:50",
    tab: "Priya + Marcus",
    claim: "Priya places the order. PayPal charges Marcus the real price and releases the rest. She never spends her own money.",
    before: "UAT-08 done.",
    steps: [
      [<>On Priya&apos;s purchase page, tap <b>Buy it for $…</b> (or <b>Send the AI shopper</b>).</>, <>&ldquo;Bought for $…, within Marcus&apos;s $….&rdquo; and &ldquo;PayPal charged exactly that and released the rest of Marcus&apos;s hold.&rdquo;</>],
      [<>Read <b>What happened</b> further down the same page.</>, <>Checked as the same product, at or under Marcus&apos;s price, before it expired. No money of Priya&apos;s moved.</>],
    ],
  },
  {
    id: "UAT-10",
    title: "Priya bills for her time with a PayPal invoice",
    video: "1:57",
    tab: "Priya + Marcus",
    claim: "She bills for her time with a PayPal invoice.",
    steps: [
      [<>On Priya&apos;s screen, open <b>Bills</b>, enter 25, and tap <b>Send Marcus a bill for $25.00</b>.</>, <>A PayPal invoice for $25.00, &ldquo;Waiting for Marcus to pay&rdquo;. It covers her time only; purchases were paid separately.</>],
    ],
  },
  {
    id: "UAT-11",
    title: "Sarah gives her AI shopper one rule",
    video: "2:05",
    tab: "AI Shopper + Sarah",
    claim: "For the office Secret Santa, Sarah gives her AI shopper one rule: a desk clock under $25.",
    before: <>Needs the PayPal sandbox buyer login from the testing notes on Devpost, and a browser that allows PayPal&apos;s popup (Chrome or Edge).</>,
    steps: [
      [<>Choose the <b>AI Shopper + Sarah</b> tab. Open <b>Rules</b>, write &ldquo;The AI shopper can buy desk clocks under $25 without asking&rdquo;, tap <b>Check what I wrote</b>, then <b>Demo: save as Sarah</b>.</>, <>Desk clocks under $25: &ldquo;You buy, Sarah pays&rdquo;.</>],
      [
        <>On Sarah&apos;s phone, tap <b>Let AI Shopper buy without asking</b>. In PayPal&apos;s window, log in with the sandbox buyer account. There&apos;s no card option here: this saves a PayPal account for later, it doesn&apos;t pay.</>,
        <>&ldquo;Standing permission is on&rdquo;. Sarah&apos;s PayPal is saved for purchases inside her rules only.</>,
      ],
    ],
  },
  {
    id: "UAT-12",
    title: "The AI shops for the occasion on its own",
    video: "2:08",
    tab: "AI Shopper + Sarah",
    claim: "She puts it on her calendar. A week before, the AI shops on its own, buys within her limit, and PayPal handles the payment.",
    before: "UAT-11 done.",
    steps: [
      [<>Open <b>Occasions</b>, tap <b>Try the Secret Santa example</b>, then <b>Add occasion</b>.</>, <>Secret Santa on the calendar, with the day the AI will shop, a week before.</>],
      [<>Tap <b>Shop now</b>. It stands in for the daily run, so you don&apos;t have to wait.</>, <>Within a minute or two, a desk clock under $25 bought with Sarah&apos;s saved PayPal, with no one asked.</>],
      [<>Tap <b>See what the AI did</b>.</>, <>Each step: what it searched, what it picked, and why the rule allowed it.</>],
    ],
  },
  {
    id: "UAT-13",
    title: "Anything outside the rule goes to Sarah",
    video: "2:16",
    tab: "AI Shopper + Sarah",
    claim: "The AI only buys on its own inside Sarah's rule. Anything else, it asks her.",
    before: <>UAT-11 done. Until Sarah saves her PayPal, everything the AI finds goes to her, so this test only means something after that.</>,
    steps: [
      [
        <>Open <b>Shop</b> and ask the AI shopper for &ldquo;gaming laptops&rdquo;.</>,
        <>It finds one, but sends it to Sarah to decide, with the reason it needs her (outside the desk-clock rule, or over the budget). Compare UAT-12, where the clock was bought without asking.</>,
      ],
    ],
  },
  {
    id: "UAT-14",
    title: "Every charge to Sarah's PayPal in one table",
    video: "2:26",
    tab: "Sarah",
    claim: "Whenever Sarah wants to know where the money went, it's all in one place: what PayPal charged and who said yes. She can sort it, search it, or download it.",
    before: "UAT-12 done, or buy something on the Sarah tab first.",
    steps: [
      [<>Choose the <b>Sarah</b> tab, open <b>History</b>, and find <b>Sarah&apos;s PayPal</b>.</>, <>Every charge to Sarah&apos;s PayPal from every tab, with who it was for and who said yes. Leo&apos;s purchases that Marcus paid for are on Marcus&apos;s table instead.</>],
      [<>Sort by <b>Amount</b>, search a word from one of your rows (&ldquo;clock&rdquo; if you ran UAT-12), and tap <b>Download as CSV</b>.</>, <>The rows sort and filter, and a CSV file downloads.</>],
    ],
  },
];

const box = "size-5 accent-relay print:appearance-auto";

export default function TestScriptPage() {
  return (
    // Print in Arial: Inter is a variable font, which prints to PDF as Type 3 glyphs that Firefox's viewer renders blurry.
    <main id="main" className="mx-auto max-w-4xl space-y-10 px-5 py-12 print:max-w-none print:space-y-6 print:p-0 print:font-[Arial,Helvetica,sans-serif] print:text-sm">
      <Link href="/" aria-label="ShopperRelay home" className="inline-block rounded-full print:hidden">
        <Image src={symbol} alt="" className="size-12" priority />
      </Link>
      <header className="space-y-4">
        <h1 className="text-[2.125rem] font-extrabold print:text-2xl">ShopperRelay test script</h1>
        <p className="text-xl text-ink-soft print:text-base">
          Check every claim in the demo video yourself, in the live demo. {TESTS.length} tests in the video&apos;s order, about 30 minutes in all. Each test can be run on its own
          unless it says otherwise.
        </p>
        <p className="text-lg print:hidden">
          <a href={videoUrl()} className="font-semibold text-relay underline underline-offset-4">
            Watch the video
          </a>{" "}
          (each test&apos;s time opens it at that moment).{" "}
          <a href="/shopperrelay-test-script.pdf" className="font-semibold text-relay underline underline-offset-4">
            Download as PDF
          </a>{" "}
          or print this page.
        </p>
        <p className="hidden text-sm print:block">Video: {videoUrl()}</p>
      </header>

      <section aria-labelledby="setup" className="space-y-3 rounded-2xl bg-mist p-6 text-lg print:break-inside-avoid print:p-4 print:text-sm">
        <h2 id="setup" className="text-2xl font-bold print:text-lg">
          Setup
        </h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[9rem_1fr]">
          <dt className="font-bold">Site</dt>
          <dd>
            <a href="https://www.shopperrelay.com/demo" className="font-semibold text-relay underline underline-offset-4">
              www.shopperrelay.com/demo
            </a>{" "}
            (Live demo on the front page). No sign-up. Your copy of the demo is private to your browser.
          </dd>
          <dt className="font-bold">Screen</dt>
          <dd>Tabs at the top pick a relationship. The shopper&apos;s app is on the left and the reviewer&apos;s phone on the right. On a phone, switch between them.</dd>
          <dt className="font-bold">Paying</dt>
          <dd>
            Use <b>Debit or Credit Card</b> (not Pay with PayPal): card <b>4111 1111 1111 1111</b>, any future date, any 3-digit CVV. PayPal&apos;s card form also asks for an
            email, name, US address and mobile number; made-up ones work, for example 1 Main St, San Jose, CA 95131 and 408 555 1234. Everything runs in the PayPal sandbox; no
            real money moves. The one exception is UAT-11, which saves a PayPal account instead of paying.
          </dd>
          <dt className="font-bold">PayPal login</dt>
          <dd>Only UAT-11 needs one: the PayPal sandbox buyer login in the Devpost testing notes. Without it, UAT-12&apos;s clock goes to Sarah to approve instead.</dd>
          <dt className="font-bold">Start over</dt>
          <dd>
            <b>Demo controls</b> (top right) → <b>Reset this demo</b> resets the tab you&apos;re on. <b>Simulate</b> skips ahead in time.
          </dd>
          <dt className="font-bold">Simulated</dt>
          <dd>Placing the order with the store, and the sample checkouts on Check a checkout. Products, prices, PayPal holds, charges, releases and invoices are real sandbox calls.</dd>
        </dl>
      </section>

      <ol className="space-y-8 print:space-y-4">
        {TESTS.map((t) => (
          <li key={t.id} id={t.id} className="space-y-4 rounded-2xl border-2 border-line p-6 print:break-inside-avoid print:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-xl font-bold print:text-base">
                {t.id}: {t.title}
              </h2>
              <p className="text-base text-ink-soft print:text-xs">
                <a href={videoUrl(seconds(t.video))} className="text-relay underline-offset-4 hover:underline print:text-ink-soft">
                  Video {t.video}
                </a>{" "}
                · Tab: {t.tab}
              </p>
            </div>
            {/* Not italic: the font has no italic face, and the slanted fallback prints garbled in some PDF viewers. */}
            <blockquote className="border-l-4 border-relay pl-4 text-lg print:text-sm">&ldquo;{t.claim}&rdquo;</blockquote>
            {t.before && (
              <p className="text-base print:text-xs">
                <b>Before you start:</b> {t.before}
              </p>
            )}
            <table className="w-full border-collapse text-left text-base print:text-xs">
              <thead>
                <tr className="border-b-2 border-line">
                  <th scope="col" className="w-10 py-2 pr-2">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Do this
                  </th>
                  <th scope="col" className="py-2">
                    You should see
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.steps.map(([doThis, expect], i) => (
                  <tr key={i} className="border-b border-line align-top last:border-b-0">
                    <td className="py-2 pr-2 font-semibold">{i + 1}</td>
                    <td className="py-2 pr-4">{doThis}</td>
                    <td className="py-2">{expect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base print:text-xs">
              <legend className="sr-only">{t.id} result</legend>
              <span className="font-bold">Result</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" className={box} /> Pass
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className={box} /> Fail
              </label>
              <span className="min-w-48 flex-1 border-b border-line text-ink-soft">Notes:</span>
            </fieldset>
          </li>
        ))}
      </ol>

      <section aria-labelledby="summary" className="space-y-3 print:break-before-page">
        <h2 id="summary" className="text-2xl font-bold print:text-lg">
          Summary
        </h2>
        <table className="w-full border-collapse text-left text-base print:text-xs">
          <thead>
            <tr className="border-b-2 border-line">
              <th scope="col" className="py-2 pr-4">
                Test
              </th>
              <th scope="col" className="py-2 pr-4">
                Claim
              </th>
              <th scope="col" className="py-2 pr-4">
                Video
              </th>
              <th scope="col" className="py-2">
                Pass / Fail
              </th>
            </tr>
          </thead>
          <tbody>
            {TESTS.map((t) => (
              <tr key={t.id} className="border-b border-line">
                <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                  <a href={`#${t.id}`} className="text-relay underline-offset-4 hover:underline print:text-ink">
                    {t.id}
                  </a>
                </td>
                <td className="py-2 pr-4">{t.title}</td>
                <td className="py-2 pr-4">{t.video}</td>
                <td className="py-2 text-ink-soft">☐ Pass ☐ Fail</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
