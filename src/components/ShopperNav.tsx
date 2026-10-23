"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Shop" },
  { href: "/check", label: "Check a checkout" },
  { href: "/rules", label: "My rules" },
  { href: "/history", label: "History" },
];

/** Pass current={null} to render without reading the URL (the loading fallback). */
export function ShopperNav({ current }: { current?: null }) {
  return current === null ? <NavLinks path={null} /> : <NavWithPath />;
}

function NavWithPath() {
  return <NavLinks path={usePathname()} />;
}

function NavLinks({ path }: { path: string | null }) {
  const isActive = (href: string) => path !== null && (href === "/" ? path === "/" || path.startsWith("/purchase") : path.startsWith(href));
  return (
    <nav aria-label="Main" className="-mx-2 flex flex-wrap gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-lg font-semibold transition-colors ${
            isActive(l.href) ? "bg-relay-wash text-relay-deep" : "text-ink-soft hover:bg-mist hover:text-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
