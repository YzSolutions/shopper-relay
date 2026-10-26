"use client";

import { useEffect, useRef, useState } from "react";

// PayPal's own Smart Buttons, loaded with intent=authorize: approving only
// places a hold. Our server creates the order and decides what happens next.

type ButtonsInstance = { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void> };
type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createOrder?: () => Promise<string>;
    onApprove: (data: { orderID?: string; vaultSetupToken?: string }) => Promise<void>;
    /** Saving a payment method instead of paying: our server's setup token id. */
    createVaultSetupToken?: () => Promise<string>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => ButtonsInstance;
};

// Paying uses intent=authorize; saving a payment method uses no intent. They are two
// separately loaded copies of PayPal's script, each under its own name.
type Mode = "pay" | "save";
const NAMESPACE: Record<Mode, string> = { pay: "paypal", save: "paypalSave" };
const sdks: Partial<Record<Mode, Promise<PayPalNamespace>>> = {};

function loadSdk(clientId: string, mode: Mode = "pay"): Promise<PayPalNamespace> {
  const loading = sdks[mode];
  if (loading) return loading;
  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    const params = new URLSearchParams({
      "client-id": clientId,
      ...(mode === "pay" && { intent: "authorize" }),
      currency: "USD",
      components: "buttons",
      "disable-funding": mode === "pay" ? "paylater,venmo,credit" : "paylater,venmo,credit,card",
    });
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.async = true;
    script.dataset.namespace = NAMESPACE[mode];
    const ns = () => (window as unknown as Record<string, PayPalNamespace | undefined>)[NAMESPACE[mode]];
    script.onload = () => (ns() ? resolve(ns()!) : reject(new Error("PayPal didn't load.")));
    script.onerror = () => {
      delete sdks[mode];
      reject(new Error("PayPal couldn't be reached. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  sdks[mode] = promise;
  return promise;
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
    let buttons: ButtonsInstance | null = null;
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
              await callbacks.current.onApprove(orderID!);
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

/**
 * PayPal's button for saving the payer's PayPal (no payment). The payer approves in
 * PayPal's window; our server turns the approval into a saved payment method.
 */
export function PayPalSaveButton({
  clientId,
  createSetupToken,
  onApprove,
  onError,
}: {
  clientId: string;
  /** Ask our server for a setup token id to approve. */
  createSetupToken: () => Promise<string>;
  /** The payer approved in PayPal; tell our server. */
  onApprove: (setupTokenId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ createSetupToken, onApprove, onError });
  useEffect(() => {
    callbacks.current = { createSetupToken, onApprove, onError };
  });

  useEffect(() => {
    let cancelled = false;
    let buttons: ButtonsInstance | null = null;
    loadSdk(clientId, "save")
      .then((paypal) => {
        if (cancelled || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", height: 52, label: "paypal" },
          createVaultSetupToken: async () => {
            try {
              return await callbacks.current.createSetupToken();
            } catch (e) {
              callbacks.current.onError(message(e));
              throw e;
            }
          },
          onApprove: async ({ vaultSetupToken }) => {
            try {
              await callbacks.current.onApprove(vaultSetupToken!);
            } catch (e) {
              callbacks.current.onError(message(e));
            }
          },
          onError: () => callbacks.current.onError("PayPal couldn't finish. Nothing was saved. Please try again."),
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
    <div>
      {!ready && <p className="text-ink-soft">Loading PayPal…</p>}
      <div ref={box} />
    </div>
  );
}
