"use client";

import { useEffect, useRef, useState } from "react";
import { api, type PurchaseView } from "@/lib/client/api";

// PayPal's own Smart Buttons, loaded with intent=authorize: approving only
// places a hold. Our server creates the order and decides whether to capture.

type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void> };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdk: Promise<PayPalNamespace> | null = null;

function loadSdk(clientId: string): Promise<PayPalNamespace> {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      "client-id": clientId,
      intent: "authorize",
      currency: "USD",
      components: "buttons",
      "disable-funding": "paylater,venmo,credit",
    });
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.async = true;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load.")));
    script.onerror = () => {
      sdk = null;
      reject(new Error("PayPal couldn't be reached. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return sdk;
}

export function PayPalButton({
  clientId,
  purchaseId,
  onDone,
  onError,
}: {
  clientId: string;
  purchaseId: string;
  onDone: (purchase: PurchaseView) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onDone, onError });
  useEffect(() => {
    callbacks.current = { onDone, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let buttons: ReturnType<PayPalNamespace["Buttons"]> | null = null;
    loadSdk(clientId)
      .then((paypal) => {
        if (cancelled || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", height: 52, label: "pay" },
          createOrder: async () => (await api<{ orderId: string }>(`/api/purchases/${purchaseId}/checkout`, { method: "POST" })).orderId,
          onApprove: async ({ orderID }) => {
            try {
              const { purchase } = await api<{ purchase: PurchaseView }>(`/api/purchases/${purchaseId}/approve`, { method: "POST", json: { orderId: orderID } });
              callbacks.current.onDone(purchase);
            } catch (e) {
              callbacks.current.onError(e instanceof Error ? e.message : String(e));
            }
          },
          onError: () => callbacks.current.onError("PayPal couldn't finish. Nothing was charged. Please try again."),
        });
        return buttons.render(box.current).then(() => !cancelled && setReady(true));
      })
      .catch((e) => !cancelled && callbacks.current.onError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      void buttons?.close?.().catch(() => undefined);
    };
  }, [clientId, purchaseId]);

  return (
    <div className="max-w-md">
      {!ready && <p className="text-ink-soft">Loading PayPal…</p>}
      <div ref={box} />
    </div>
  );
}
