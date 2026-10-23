"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type LogEvent, type PurchaseView } from "./api";

/** States where someone else may act at any moment, so the page keeps checking. */
const LIVE = new Set(["checkout", "awaiting_review", "requested", "hunting"]);

/** A purchase and its log, refreshed every few seconds while it's waiting on someone. */
export function usePurchase(id: string) {
  const [purchase, setPurchase] = useState<PurchaseView | null>(null);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ purchase: PurchaseView; log: LogEvent[] }>(`/api/purchases/${id}`);
      setPurchase(data.purchase);
      setLog(data.log);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void reload();
  }, [reload]);

  const live = purchase ? LIVE.has(purchase.state) : false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [live, reload]);

  return { purchase, log, error, reload, setPurchase };
}
