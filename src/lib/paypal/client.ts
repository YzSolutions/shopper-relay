// Thin server-side wrapper over PayPal's REST APIs (Orders v2, Payments v2).
// Purchases are authorized first and only captured once the owner's rules,
// or the trusted contact, allow it. A declined review voids the hold.

import { centsToDecimal } from "../money";

const BASE_URL = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export interface Money {
  currency_code: string;
  value: string;
}

export interface Link {
  href: string;
  rel: string;
  method?: string;
}

export interface Authorization {
  id: string;
  status: "CREATED" | "CAPTURED" | "DENIED" | "PARTIALLY_CAPTURED" | "VOIDED" | "PENDING";
  amount: Money;
  expiration_time?: string;
  custom_id?: string;
  status_details?: { reason?: string };
}

export interface Order {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links?: Link[];
  purchase_units?: Array<{
    custom_id?: string;
    amount?: Money;
    payments?: { authorizations?: Authorization[] };
  }>;
}

export interface Capture {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
  amount: Money;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  env?: keyof typeof BASE_URL;
}

export function configFromEnv(): PayPalConfig {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (see .env.example).");
  const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  return { clientId, clientSecret, env };
}

export function createPayPalClient({ clientId, clientSecret, env = "sandbox" }: PayPalConfig) {
  const base = BASE_URL[env];
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt - 60_000) return token.value;
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json();
    if (!res.ok) throw new PayPalError("PayPal auth failed", res.status, body);
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    { body, requestId }: { body?: unknown; requestId?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    // Makes retries safe: resending the same id returns the first result.
    if (requestId) headers["PayPal-Request-Id"] = requestId;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!res.ok) throw new PayPalError(`PayPal ${method} ${path} failed (${res.status})`, res.status, parsed);
    return parsed as T;
  }

  return {
    /** Create an order that only places a hold once the buyer approves. */
    createAuthorizeOrder(args: {
      amountCents: number;
      currency?: string;
      description: string;
      customId: string;
      returnUrl: string;
      cancelUrl: string;
      brandName?: string;
      requestId: string;
    }) {
      return call<Order>("POST", "/v2/checkout/orders", {
        requestId: args.requestId,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              custom_id: args.customId,
              description: args.description.slice(0, 127),
              amount: { currency_code: args.currency ?? "USD", value: centsToDecimal(args.amountCents) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: args.brandName,
                shipping_preference: "NO_SHIPPING",
                user_action: "CONTINUE",
                return_url: args.returnUrl,
                cancel_url: args.cancelUrl,
              },
            },
          },
        },
      });
    },

    getOrder: (orderId: string) => call<Order>("GET", `/v2/checkout/orders/${orderId}`),

    /** After the buyer approves, place the hold. */
    authorizeOrder: (orderId: string, requestId: string) =>
      call<Order>("POST", `/v2/checkout/orders/${orderId}/authorize`, { body: {}, requestId }),

    /** The hold as PayPal sees it. Its amount is the one that counts. */
    getAuthorization: (authorizationId: string) =>
      call<Authorization>("GET", `/v2/payments/authorizations/${authorizationId}`),

    /** Take the full held amount. */
    captureAuthorization: (authorizationId: string, requestId: string) =>
      call<Capture>("POST", `/v2/payments/authorizations/${authorizationId}/capture`, {
        body: { final_capture: true },
        requestId,
      }),

    /** Release the hold. Nothing is charged. */
    voidAuthorization: (authorizationId: string, requestId: string) =>
      call<Authorization | null>("POST", `/v2/payments/authorizations/${authorizationId}/void`, { requestId }),
  };
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

/** The link the buyer follows to approve the order in PayPal. */
export function approvalLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}

export function firstAuthorization(order: Order): Authorization | undefined {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}
