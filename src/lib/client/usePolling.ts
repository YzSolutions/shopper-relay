"use client";

import { useEffect } from "react";

/**
 * Run `fn` every `ms` while the page can be seen, so a tab left in the background
 * asks for nothing. Coming back to it runs `fn` straight away, so nothing looks
 * out of date. `fn` must be stable (useCallback).
 */
export function usePolling(fn: () => void, ms: number, on = true) {
  useEffect(() => {
    if (!on) return;
    const run = () => {
      if (!document.hidden) fn();
    };
    const t = setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", run);
    };
  }, [fn, ms, on]);
}
