"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The front page's links. On a wide screen they sit in the header; on anything narrower
// a Menu button opens them as a list, and choosing one (or Escape) closes it.

export function FrontNav({ links }: { links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <nav aria-label="Page" className="flex items-center gap-x-3 text-base font-semibold sm:gap-x-6 sm:text-lg">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="hidden text-ink-soft hover:text-ink xl:inline">
            {l.label}
          </a>
        ))}
        <Link href="/demo" className="rounded-xl bg-relay px-3 py-2 whitespace-nowrap sm:px-4 text-white hover:bg-relay-deep">
          Live demo
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="front-menu"
          onClick={() => setOpen(!open)}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border-2 border-line px-2.5 sm:px-3 text-ink hover:border-ink-soft xl:hidden"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          {/* Just the icon on a phone, so the header fits; screen readers still hear "Menu". */}
          <span className="sr-only sm:not-sr-only">Menu</span>
        </button>
      </nav>
      {open && (
        <ul id="front-menu" className="absolute inset-x-0 top-full border-b border-line bg-white px-5 pb-4 shadow-[0_16px_30px_-20px_rgba(1,62,163,0.35)] xl:hidden">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-3.5 text-xl font-semibold last:border-b-0 hover:text-relay">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
