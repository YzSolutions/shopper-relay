"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/check", label: "Check a checkout" },
  { href: "/rules", label: "Rules" },
  { href: "/history", label: "History" },
];

/**
 * Pass current={null} to render without reading the URL (the loading fallback).
 * `bills`: the shopper bills for their time here (Personal shopper).
 * `ownRules`: the rules are the shopper's own (Mom), so they're "My rules".
 * `check`: people check checkouts they found elsewhere; the AI Shopper doesn't.
 * `occasions`: dates the AI shops ahead of (AI Shopper).
 */
export function ShopperNav({ current, bills = false, ownRules = false, check = true, occasions = false }: { current?: null; bills?: boolean; ownRules?: boolean; check?: boolean; occasions?: boolean }) {
  const kept = check ? LINKS : LINKS.filter((l) => l.href !== "/check");
  const shown = occasions ? [kept[0], { href: "/occasions", label: "Occasions" }, ...kept.slice(1)] : kept;
  const named = ownRules ? shown.map((l) => (l.href === "/rules" ? { ...l, label: "My rules" } : l)) : shown;
  const links = bills ? [...named.slice(0, -1), { href: "/bills", label: "Bills" }, ...named.slice(-1)] : named;
  return current === null ? <NavLinks path={null} links={links} /> : <NavWithPath links={links} />;
}

function NavWithPath({ links }: { links: typeof LINKS }) {
  return <NavLinks path={usePathname()} links={links} />;
}

function NavLinks({ path, links }: { path: string | null; links: typeof LINKS }) {
  const isActive = (href: string) => path !== null && (href === "/shop" ? path === "/shop" || path.startsWith("/purchase") : path.startsWith(href));
  return (
    <nav aria-label="Main" className="-mx-2 flex flex-wrap gap-1">
      {links.map((l) => (
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
