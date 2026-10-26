"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Session } from "./api";

/** The household, its rules and PayPal's client id. Refetch after anything changes the rules. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Refetch; resolves to the new session, or null if it couldn't load. */
  const reload = useCallback(async (): Promise<Session | null> => {
    try {
      const s = await api<Session>("/api/session");
      setSession(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void reload();
  }, [reload]);
  return { session, error, reload };
}
