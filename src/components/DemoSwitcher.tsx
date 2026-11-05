"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

/** Demo only: switch which of the four setups this browser shows. */
export function DemoSwitcher() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  if (!session) return null;

  async function pick(mode: string) {
    setBusy(true);
    try {
      await api("/api/demo", { method: "POST", json: { action: "mode", mode } });
      // A full reload on purpose: every screen kept alive by Next.js holds the old relationship's data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/shop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-semibold">Demo: showing</span>
      {session.relationships.map((r) => (
        <button
          key={r.id}
          type="button"
          disabled={busy || r.id === session.relationship.id}
          onClick={() => void pick(r.id)}
          aria-current={r.id === session.relationship.id ? "true" : undefined}
          className={
            r.id === session.relationship.id
              ? "rounded-lg bg-white px-3 py-1 font-semibold text-relay-deep shadow-sm"
              : "rounded-lg px-3 py-1 font-semibold text-relay underline-offset-4 hover:underline disabled:opacity-50"
          }
        >
          {r.tab}
        </button>
      ))}
      <a href="/demo" className="font-semibold text-relay underline-offset-4 hover:underline">
        Side-by-side demo
      </a>
      <span className="ml-auto text-sm text-ink-soft">Build {session.build}</span>
    </div>
  );
}
