import { configFromEnv, createPayPalClient } from "@/lib/paypal/client";
import { logEvent } from "@/lib/store/events";
import { getPurchaseByPayPalId } from "@/lib/store/purchases";

// PayPal tells us about payment changes here. Every event is verified with
// PayPal before it's trusted. The app never waits on webhooks to move a
// purchase forward (the API responses do that); they confirm and record.

type PayPalEvent = {
  id: string;
  event_type: string;
  summary?: string;
  resource?: { id?: string; status?: string; amount?: { value: string; currency_code: string }; supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } } };
};

export async function POST(req: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return new Response("Webhook not configured", { status: 503 });

  const event = (await req.json().catch(() => null)) as PayPalEvent | null;
  if (!event?.id || !event.event_type) return new Response("Bad request", { status: 400 });

  const paypal = createPayPalClient(configFromEnv());
  const verified = await paypal.verifyWebhook(webhookId, req.headers, event).catch(() => false);
  if (!verified) return new Response("Signature check failed", { status: 400 });

  const r = event.resource ?? {};
  const ids = [r.id, r.supplementary_data?.related_ids?.authorization_id, r.supplementary_data?.related_ids?.order_id].filter(Boolean) as string[];
  for (const id of ids) {
    const purchase = await getPurchaseByPayPalId(id);
    if (!purchase) continue;
    await logEvent({
      householdId: purchase.householdId,
      purchaseId: purchase.id,
      type: "paypal_webhook",
      actor: "paypal",
      message: `PayPal confirmed: ${event.summary ?? event.event_type}${r.status ? ` (${r.status})` : ""}.`,
      detail: { eventId: event.id, type: event.event_type, resourceId: r.id, amount: r.amount },
    });
    break;
  }
  return new Response("ok");
}
