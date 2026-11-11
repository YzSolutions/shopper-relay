import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import symbol from "../../public/brand/shopperrelay-symbol.png";

/** The reviewer's pages: no shopping navigation, sized for a phone. */
export function PhoneShell({ title, inboxLink = false, children }: { title: string; inboxLink?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <Image src={symbol} alt="" className="size-9" priority />
        <p className="text-lg font-bold">
          <span className="font-black tracking-[-0.035em]">
            <span className="text-ledger">Shopper</span>
            <span className="text-signal">Relay</span>
          </span>
          {/* With the All requests link, a phone has room for one line only, so the title waits for a wider screen. */}
          <span className={`font-semibold text-ink-soft ${inboxLink ? "hidden sm:inline" : ""}`}> {title}</span>
        </p>
        {/* From a single request, the way back to everything waiting (and the "buy without asking" switch). */}
        {inboxLink && (
          <Link href="/inbox" className="ml-auto inline-flex min-h-11 items-center font-semibold whitespace-nowrap text-relay underline underline-offset-4">
            All requests
          </Link>
        )}
      </header>
      <main id="main" className="mx-auto max-w-lg px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
