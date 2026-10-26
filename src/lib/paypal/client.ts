// Thin server-side wrapper over PayPal's REST APIs (Orders v2, Payments v2,
// Vault v3, Invoicing v2).
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

/** A saved payment method waiting for the payer's OK (PayPal Vault v3). */
export interface SetupToken {
  id: string;
  status: "CREATED" | "PAYER_ACTION_REQUIRED" | "APPROVED" | "VAULTED" | "TOKENIZED";
  links?: Link[];
}

/** A saved payment method that can be charged later without the payer present. */
export interface PaymentToken {
  id: string;
  customer?: { id: string };
  payment_source?: {
    paypal?: { email_address?: string; name?: { given_name?: string; surname?: string } };
    card?: { brand?: string; last_digits?: string };
  };
}

/** A PayPal invoice (Invoicing v2). PayPal hosts the page where it's paid. */
export interface Invoice {
  id: string;
  status: "DRAFT" | "SENT" | "SCHEDULED" | "PAID" | "MARKED_AS_PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_PAID" | "PARTIALLY_REFUNDED" | "MARKED_AS_REFUNDED" | "UNPAID" | "PAYMENT_PENDING";
  detail?: { invoice_number?: string; metadata?: { recipient_view_url?: string } };
  amount?: Money;
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
    method: "GET" | "POST" | "DELETE",
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
      /** Redirect checkout. Leave out when the PayPal buttons open their own popup. */
      returnUrl?: string;
      cancelUrl?: string;
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
          ...(args.returnUrl && {
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
          }),
        },
      });
    },

    /**
     * Start saving the payer's PayPal for later purchases. The payer approves it
     * in PayPal's own window; nothing is charged.
     */
    createPayPalSetupToken: (args: { brandName: string; description: string; returnUrl: string; cancelUrl: string; requestId: string }) =>
      call<SetupToken>("POST", "/v3/vault/setup-tokens", {
        requestId: args.requestId,
        body: {
          payment_source: {
            paypal: {
              description: args.description.slice(0, 127),
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
              permit_multiple_payment_tokens: false,
              experience_context: {
                brand_name: args.brandName,
                shipping_preference: "NO_SHIPPING",
                vault_instruction: "ON_PAYER_APPROVAL",
                return_url: args.returnUrl,
                cancel_url: args.cancelUrl,
              },
            },
          },
        },
      }),

    /** Sandbox/test only: save a test card instead of a payer approving in PayPal, so scripts can run the flow. */
    createTestCardSetupToken(card: { number: string; expiry: string; securityCode: string; name: string }) {
      if (env !== "sandbox") throw new Error("Test cards only work in sandbox.");
      return call<SetupToken>("POST", "/v3/vault/setup-tokens", {
        body: { payment_source: { card: { number: card.number, expiry: card.expiry, security_code: card.securityCode, name: card.name } } },
      });
    },

    /** The payer approved: turn the setup token into a saved payment method. */
    createPaymentToken: (setupTokenId: string) =>
      call<PaymentToken>("POST", "/v3/vault/payment-tokens", {
        requestId: `payment-token-${setupTokenId}`,
        body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
      }),

    /** Forget a saved payment method at PayPal. */
    deletePaymentToken: (paymentTokenId: string) => call<null>("DELETE", `/v3/vault/payment-tokens/${paymentTokenId}`),

    /**
     * Place a hold on a saved payment method, with no payer present. PayPal
     * answers at once: the order comes back COMPLETED with its authorization.
     */
    createSavedPaymentAuthorization(args: { paymentTokenId: string; method: "paypal" | "card"; amountCents: number; currency?: string; description: string; customId: string; requestId: string }) {
      const source =
        args.method === "card"
          ? { card: { vault_id: args.paymentTokenId, stored_credential: { payment_initiator: "MERCHANT", payment_type: "UNSCHEDULED", usage: "SUBSEQUENT" } } }
          : { paypal: { vault_id: args.paymentTokenId } };
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
          payment_source: source,
        },
      });
    },

    /**
     * A draft invoice for one fee. PayPal numbers it; the customer pays on
     * PayPal's own invoice page.
     */
    createInvoice(args: { amountCents: number; currency?: string; itemName: string; note: string; invoicerName: string; requestId: string }) {
      const currency = args.currency ?? "USD";
      return call<Invoice>("POST", "/v2/invoicing/invoices", {
        requestId: args.requestId,
        body: {
          detail: { currency_code: currency, note: args.note.slice(0, 4000), payment_term: { term_type: "DUE_ON_RECEIPT" } },
          invoicer: { business_name: args.invoicerName.slice(0, 300) },
          items: [{ name: args.itemName.slice(0, 200), quantity: "1", unit_amount: { currency_code: currency, value: centsToDecimal(args.amountCents) } }],
        },
      });
    },

    /**
     * Send the invoice. PayPal doesn't email anyone (`send_to_recipient: false`):
     * our app shows the customer the returned link to PayPal's payment page.
     */
    sendInvoice: (invoiceId: string, requestId: string) =>
      call<Link>("POST", `/v2/invoicing/invoices/${invoiceId}/send`, { requestId, body: { send_to_recipient: false, send_to_invoicer: false } }),

    getInvoice: (invoiceId: string) => call<Invoice>("GET", `/v2/invoicing/invoices/${invoiceId}`),

    /** Withdraw an unpaid invoice. */
    cancelInvoice: (invoiceId: string) =>
      call<unknown>("POST", `/v2/invoicing/invoices/${invoiceId}/cancel`, { body: { send_to_recipient: false, send_to_invoicer: false } }),

    /** Sandbox/test only: record a payment, so scripts can check a bill turns paid without a buyer logging in. */
    recordInvoicePayment(invoiceId: string, amountCents: number, currency = "USD") {
      if (env !== "sandbox") throw new Error("Recording test payments only works in sandbox.");
      return call<unknown>("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, {
        body: { method: "OTHER", payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: currency, value: centsToDecimal(amountCents) } },
      });
    },

    /**
     * Sandbox/test only: approve an order with a test card instead of a buyer
     * logging in, so the full flow can be exercised by a script.
     */
    confirmWithTestCard(orderId: string, card: { number: string; expiry: string; securityCode: string; name: string }) {
      if (env !== "sandbox") throw new Error("Test cards only work in sandbox.");
      return call<Order>("POST", `/v2/checkout/orders/${orderId}/confirm-payment-source`, {
        body: { payment_source: { card: { number: card.number, expiry: card.expiry, security_code: card.securityCode, name: card.name } } },
      });
    },

    /**
     * Ask PayPal whether a webhook really came from PayPal. Needs the raw
     * headers and the parsed body exactly as received.
     */
    async verifyWebhook(webhookId: string, headers: Headers, event: unknown): Promise<boolean> {
      const res = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
        body: {
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: event,
        },
      });
      return res.verification_status === "SUCCESS";
    },

    getOrder: (orderId: string) => call<Order>("GET", `/v2/checkout/orders/${orderId}`),

    /** After the buyer approves, place the hold. */
    authorizeOrder: (orderId: string, requestId: string) =>
      call<Order>("POST", `/v2/checkout/orders/${orderId}/authorize`, { body: {}, requestId }),

    /** The hold as PayPal sees it. Its amount is the one that counts. */
    getAuthorization: (authorizationId: string) =>
      call<Authorization>("GET", `/v2/payments/authorizations/${authorizationId}`),

    /**
     * Take the held money: all of it, or just `amountCents` of it. Either way
     * this is the final capture, so PayPal releases whatever is left.
     */
    captureAuthorization: (authorizationId: string, requestId: string, amount?: { cents: number; currency: string }) =>
      call<Capture>("POST", `/v2/payments/authorizations/${authorizationId}/capture`, {
        body: {
          final_capture: true,
          ...(amount && { amount: { currency_code: amount.currency, value: centsToDecimal(amount.cents) } }),
        },
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
