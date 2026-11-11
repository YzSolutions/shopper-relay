import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import symbol from "../../../public/brand/shopperrelay-symbol.png";

export const metadata: Metadata = { title: "Privacy" };

// Plain words on what the demo keeps and who sees what. Keep it in step with the code:
// the visitor cookie (src/config/visitor.ts), the mode cookie (api/demo), and the providers used.

const SECTIONS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "This is a demo",
    body: (
      <p>
        ShopperRelay is a prototype built by InDigitual for the PayPal AI Hackathon. There&apos;s no sign-in and no real money: payments run in the PayPal sandbox, and placing the
        order with the store is simulated. Please don&apos;t enter real card numbers or personal details.
      </p>
    ),
  },
  {
    title: "Cookies",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <b>sr_visitor</b> is a random id that gives your browser its own copy of the demo, so nobody else sees or changes it. It lasts 120 days.
        </li>
        <li>
          <b>sr_mode</b> remembers which demo tab you&apos;re on (Mom, Leo, Priya, the AI shopper or Sarah). It lasts 30 days.
        </li>
        <li>There are no advertising, analytics or tracking cookies.</li>
      </ul>
    ),
  },
  {
    title: "What the demo keeps",
    body: (
      <div className="space-y-3">
        <p>
          What you do in your copy of the demo: the purchases you choose, the rules you write, occasions on the calendar, bills and the history of each step. It&apos;s tied only to that
          random id, not to a name or email. <b>Reset this demo</b> (under Demo controls) deletes it for the tab you&apos;re on.
        </p>
        <p>
          To save time and cost, Gemini&apos;s answers are kept in a shared cache that isn&apos;t tied to anyone: what was read from a screenshot, how a rule was understood, and how a
          search was worded. Reset doesn&apos;t clear that cache. A PayPal account saved for &ldquo;buy without asking&rdquo; is deleted at PayPal when you turn it off on the reviewer&apos;s
          phone; Reset only forgets it here, so turn it off first.
        </p>
      </div>
    ),
  },
  {
    title: "Who else handles what",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <b>PayPal</b> handles every payment and saved payment method, in its own window. Anything you type there goes to PayPal, not to us.
        </li>
        <li>
          <b>Google Gemini</b> reads checkout screenshots, rules written in plain words, what you type into search, and product details. A screenshot is sent to Gemini to be read;
          ShopperRelay doesn&apos;t keep the picture, only what was read from it.
        </li>
        <li>
          <b>Channel3</b> runs product search, and product photos load from its servers.
        </li>
        <li>
          <b>Neon</b> stores the demo data, and <b>Vercel</b> hosts the site.
        </li>
      </ul>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-8 px-5 py-12">
      <Link href="/" aria-label="ShopperRelay home" className="inline-block rounded-full">
        <Image src={symbol} alt="" className="size-12" priority />
      </Link>
      <h1 className="text-[2.125rem] font-extrabold">Privacy</h1>
      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-3 text-lg">
          <h2 className="text-2xl font-bold">{s.title}</h2>
          {s.body}
        </section>
      ))}
    </main>
  );
}
