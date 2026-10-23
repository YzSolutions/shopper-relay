import Image from "next/image";
import type { ReactNode } from "react";
import symbol from "../../public/brand/shopperrelay-symbol.png";

/** The reviewer's pages: no shopping navigation, sized for a phone. */
export function PhoneShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <Image src={symbol} alt="" className="size-9" priority />
        <p className="text-lg font-bold">
          <span className="font-black tracking-[-0.035em]">
            <span className="text-ledger">Shopper</span>
            <span className="text-signal">Relay</span>
          </span>
          <span className="font-semibold text-ink-soft"> {title}</span>
        </p>
      </header>
      <main className="mx-auto max-w-lg px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
