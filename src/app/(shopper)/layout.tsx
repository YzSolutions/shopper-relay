import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { ShopperNav } from "@/components/ShopperNav";
import logo from "../../../public/brand/shopperrelay-logo-trimmed.png";

export default function ShopperLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
          <Link href="/" aria-label={`${brand.name} home`} className="shrink-0">
            <Image src={logo} alt={brand.name} priority className="h-11 w-auto" />
          </Link>
          {/* The nav reads the URL to highlight the current page, so it streams in. */}
          <Suspense fallback={<ShopperNav current={null} />}>
            <ShopperNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-20">{children}</main>
      <footer className="border-t border-line bg-mist">
        <p className="mx-auto max-w-5xl px-5 py-5 text-base text-ink-soft">
          Payments by PayPal (sandbox). In this prototype, {brand.name} receives the payment and placing the order with the store is simulated.
        </p>
      </footer>
    </div>
  );
}
