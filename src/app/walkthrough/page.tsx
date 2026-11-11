import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import symbol from "../../../public/brand/shopperrelay-symbol.png";

export const metadata: Metadata = { title: "Walkthrough" };

// Reproduce each claim the demo video makes, in the video's order. Keep the button names in step
// with the app (the guided tour in src/config/tour.ts uses the same ones).

type Scene = { who: string; tab: string; claim: string; steps: React.ReactNode[]; see: string };

const SCENES: Scene[] = [
  {
    who: "Mom",
    tab: "Mom + Sarah",
    claim: "Sarah helps Mom write her own shopping rules. Big purchases and subscriptions get a second look.",
    steps: [<>Mom&apos;s screen → <b>My rules</b>.</>],
    see: "General Shopping $150.00 and up, and Subscriptions of any amount: “Sarah takes a look”. Mom buys everything else on her own.",
  },
  {
    who: "Mom",
    tab: "Mom + Sarah",
    claim: "It says $149, but the small print adds $39 a month. ShopperRelay's AI catches it, and Mom's rules bring Sarah in.",
    steps: [
      <><b>Check a checkout</b> → <b>A checkout with a membership in the small print</b> (a sample checkout from a made-up store; product search never shows memberships).</>,
      <>Read the result, then tap <b>Buy it through ShopperRelay</b>.</>,
    ],
    see: "“$149.00 today, then $39.00 every month after a 30-day free trial”, the small print quoted, and “Sarah takes a look first”.",
  },
  {
    who: "Mom",
    tab: "Mom + Sarah",
    claim: "PayPal is only holding the money, so nothing's charged. Sarah sees the hidden fee, says no, and sends Mom one with no monthly fee.",
    steps: [
      <>Pay with <b>Debit or Credit Card</b> (test card below).</>,
      <>On Sarah&apos;s phone, open the request. Under <b>A better option for Mom</b>, tap <b>Decline and send Mom this one</b>.</>,
    ],
    see: "Mom's screen: “Sent to Sarah to take a look”, then the decline, “PayPal released the hold, so nothing was charged”, and the cheaper monitor Sarah sent.",
  },
  {
    who: "Mom",
    tab: "Mom + Sarah",
    claim: "If someone pressures Mom to change a rule, it waits. Sarah's told, and can hold it up to 3 days to talk it over.",
    steps: [
      <><b>My rules</b> → write “I can buy medical devices up to $500 on my own” → <b>Check what I wrote</b> → <b>Save these rules</b>.</>,
      <>On Sarah&apos;s phone (<b>All requests</b> if you&apos;re on a request), tap <b>Delay for 3 days</b>.</>,
    ],
    see: "The looser rule waits 24 hours, and the stricter one stays in force. After the delay it starts 3 days from then, unless Sarah lets it start sooner.",
  },
  {
    who: "Leo",
    tab: "Leo + Sarah",
    claim: "Sarah prefers that Dad handle all electronic purchases, so Leo's request goes to Marcus.",
    steps: [
      <>Leo&apos;s screen → <b>Rules</b>: Electronics, “Reviewed by Marcus”.</>,
      <><b>Shop</b> → search “laptop” → <b>Ask Marcus</b> on one → <b>Send to Marcus</b>.</>,
    ],
    see: "The request waits for Marcus, not Sarah.",
  },
  {
    who: "Leo",
    tab: "Leo + Sarah",
    claim: "Marcus sees it next to Leo's budget and makes the call. Leo never needs a parent's login.",
    steps: [<>On the phone, switch the inbox to <b>Marcus</b> and open the request.</>],
    see: "The laptop with its price, store link and Leo's budget beside it, and Approve with PayPal or Decline for Marcus. Leo only ever asks.",
  },
  {
    who: "Priya",
    tab: "Priya + Marcus",
    claim: "Sarah and Marcus give Priya a $200 budget to buy without asking.",
    steps: [<>Priya&apos;s screen → <b>Rules</b> → write “Priya can buy clothing up to $200 without asking” → <b>Check what I wrote</b> → <b>Demo: save as Marcus</b>.</>],
    see: "Clothing up to $200.00: “You buy, Marcus pays”. (It works once Marcus saves his PayPal; until then the app says “Marcus decides until Marcus's PayPal is saved”.)",
  },
  {
    who: "Priya",
    tab: "Priya + Marcus",
    claim: "The jacket is $250, so Priya sends it to Marcus. He OKs this one jacket up to $275, and PayPal holds that much.",
    steps: [
      <><b>Shop</b> → search “sport coat” (or “running shoes”) → pick one, over $200 to match the video → <b>Request for Marcus</b> → <b>Send to Marcus</b>.</>,
      <>On Marcus&apos;s phone: <b>Let Priya buy it once, up to a price I set</b> → enter a little above the price → <b>Continue to PayPal</b> → pay with the card.</>,
    ],
    see: "“Only this exact product counts”, and PayPal holding Marcus's maximum.",
  },
  {
    who: "Priya",
    tab: "Priya + Marcus",
    claim: "Priya places the order. PayPal charges Marcus the real price and releases the rest. She never spends her own money.",
    steps: [<>Priya&apos;s purchase page → <b>Buy it for $…</b> (or <b>Send the AI shopper</b>).</>],
    see: "“PayPal charged exactly” the price, and the difference released, checked as the same product, at or under Marcus's price, before it expired.",
  },
  {
    who: "Priya",
    tab: "Priya + Marcus",
    claim: "She bills for her time with a PayPal invoice.",
    steps: [<><b>Bills</b> → amount 25 → <b>Send Marcus a bill</b>.</>],
    see: "A $25.00 PayPal invoice “Waiting for Marcus to pay”, for her time only.",
  },
  {
    who: "Sarah",
    tab: "AI Shopper + Sarah",
    claim: "For the office Secret Santa, Sarah gives her AI shopper one rule: a desk clock under $25.",
    steps: [
      <><b>Rules</b> → write “The AI shopper can buy desk clocks under $25 without asking” → <b>Check what I wrote</b> → <b>Demo: save as Sarah</b>.</>,
      <>Once only: on Sarah&apos;s phone tap <b>Let AI Shopper buy without asking</b> and log in with the PayPal sandbox buyer account (Chrome or Edge, popups allowed).</>,
    ],
    see: "Desk Clocks under $25.00: “You buy, Sarah pays”, and “Standing permission is on”.",
  },
  {
    who: "Sarah",
    tab: "AI Shopper + Sarah",
    claim: "She puts it on her calendar. A week before, the AI shops on its own, buys within her limit, and PayPal handles the payment.",
    steps: [
      <><b>Occasions</b> → <b>Try the Secret Santa example</b> → <b>Add occasion</b>.</>,
      <>Tap <b>Shop now</b> (it stands in for the daily run a week before) → <b>See what the AI did</b>.</>,
      <>Outside the rule: on <b>Shop</b>, ask for “gaming laptops”.</>,
    ],
    see: "Secret Santa on the calendar with the day it shops. A clock under $25 bought with Sarah's saved PayPal, and it won't shop twice. The laptop goes to Sarah instead.",
  },
  {
    who: "Sarah",
    tab: "Sarah",
    claim: "Whenever Sarah wants to know where the money went, it's all in one place: what PayPal charged and who said yes. She can sort it, search it, or download it.",
    steps: [<>Optional: <b>Shop</b> for something for herself. Then <b>History</b> → <b>Sarah&apos;s PayPal</b>: sort by Amount, search “clock”, <b>Download as CSV</b>.</>],
    see: "Everything charged to Sarah's PayPal from every relationship, with who it was for. Leo's tech Marcus paid for is on Marcus's table (the Priya + Marcus tab), and Mom's own shopping on Mom's.",
  },
];

export default function WalkthroughPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-10 px-5 py-12">
      <Link href="/" aria-label="ShopperRelay home" className="inline-block rounded-full">
        <Image src={symbol} alt="" className="size-12" priority />
      </Link>
      <header className="space-y-4">
        <h1 className="text-[2.125rem] font-extrabold">Walkthrough: every claim in the video</h1>
        <p className="text-xl text-ink-soft">Each line the video says, and how to see it yourself in the live demo. About 20 minutes end to end.</p>
      </header>

      <section aria-labelledby="start" className="space-y-3 rounded-2xl bg-mist p-6 text-lg">
        <h2 id="start" className="text-2xl font-bold">
          Before you start
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Open the <Link href="/demo" className="font-semibold text-relay underline underline-offset-4">Live demo</Link>. Pick a tab at the top; the shopper&apos;s screen is on the
            left, the reviewer&apos;s phone on the right (on a phone, switch between them). Your copy of the demo is private.
          </li>
          <li>
            To pay, use <b>Debit or Credit Card</b>, not Pay with PayPal: it works in every browser. Test card <b>4111 1111 1111 1111</b>, any future date, any 3-digit CVV. It&apos;s all
            the PayPal sandbox; no real money moves.
          </li>
          <li>
            Only saving a reviewer&apos;s PayPal (&ldquo;Let &hellip; buy without asking&rdquo;) needs a PayPal sandbox buyer login and PayPal&apos;s own window, so use Chrome or Edge with popups
            allowed. That switch is on the reviewer&apos;s phone under <b>All requests</b>.
          </li>
          <li>Stuck? <b>Demo controls</b> → <b>Reset this demo</b> starts that tab over.</li>
        </ul>
      </section>

      <ol className="space-y-6">
        {SCENES.map((s, i) => (
          <li key={i} className="space-y-3 rounded-2xl border-2 border-line p-6 text-lg">
            <p className="text-base font-semibold text-ink-soft">
              {s.who} · tab: {s.tab}
            </p>
            <h2 className="text-xl font-bold">&ldquo;{s.claim}&rdquo;</h2>
            <ol className="list-decimal space-y-1.5 pl-6">
              {s.steps.map((step, j) => (
                <li key={j}>{step}</li>
              ))}
            </ol>
            <p className="border-l-4 border-ledger pl-4">
              <b>You&apos;ll see:</b> {s.see}
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
