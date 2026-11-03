"use client";

import { useState } from "react";
import type { RelationshipId } from "@/config/relationships";
import { api } from "@/lib/client/api";

/** Front page: open the side-by-side demo already showing one relationship. */
export function TryDemoButton({ mode, children, className = "" }: { mode: RelationshipId; children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      await api("/api/demo", { method: "POST", json: { action: "mode", mode } });
    } finally {
      // Even if switching failed, the demo still opens on whatever it showed last.
      // A full load on purpose, like DemoSwitcher: nothing kept alive holds the old relationship.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/demo");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className={`inline-flex min-h-13 items-center justify-center rounded-xl border-2 border-relay px-5 py-2.5 text-lg font-semibold text-relay transition-colors hover:bg-relay hover:text-white disabled:opacity-60 ${className}`}
    >
      {busy ? "Opening…" : children}
    </button>
  );
}
