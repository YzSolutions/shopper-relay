"use client";

import { useEffect, useRef, useState } from "react";

// PayPal's own Smart Buttons, loaded with intent=authorize: approving only
// places a hold. Our server creates the order and decides what happens next.

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

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PayPalButton({
  clientId,
  createOrder,
  onApprove,
  onError,
}: {
  clientId: string;
  /** Ask our server for a PayPal order id to approve. */
  createOrder: () => Promise<string>;
  /** The payer approved in PayPal; tell our server. */
  onApprove: (orderId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ createOrder, onApprove, onError });
  useEffect(() => {
    callbacks.current = { createOrder, onApprove, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let buttons: ReturnType<PayPalNamespace["Buttons"]> | null = null;
    loadSdk(clientId)
      .then((paypal) => {
        if (cancelled || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", height: 52, label: "pay" },
          createOrder: async () => {
            try {
              return await callbacks.current.createOrder();
            } catch (e) {
              callbacks.current.onError(message(e));
              throw e;
            }
          },
          onApprove: async ({ orderID }) => {
            try {
              await callbacks.current.onApprove(orderID);
            } catch (e) {
              callbacks.current.onError(message(e));
            }
          },
          onError: () => callbacks.current.onError("PayPal couldn't finish. Nothing was charged. Please try again."),
        });
        return buttons.render(box.current).then(() => !cancelled && setReady(true));
      })
      .catch((e) => !cancelled && callbacks.current.onError(message(e)));
    return () => {
      cancelled = true;
      void buttons?.close?.().catch(() => undefined);
    };
  }, [clientId]);

  return (
    <div className="max-w-md">
      {!ready && <p className="text-ink-soft">Loading PayPal…</p>}
      <div ref={box} />
    </div>
  );
}
