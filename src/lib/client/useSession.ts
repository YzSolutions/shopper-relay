"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Session } from "./api";

/** The household, its rules and PayPal's client id. Refetch after anything changes the rules. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setSession(await api<Session>("/api/session"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void reload();
  }, [reload]);
  return { session, error, reload };
}
