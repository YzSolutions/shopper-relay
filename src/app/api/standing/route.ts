import { z } from "zod";
import { body, handle } from "@/lib/http";
import { confirmStanding, revokeStanding, standingView, startStandingSetup } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";

// Standing permission, from the payer's phone: save PayPal once so the shopper can
// buy what the payer's rules allow, or turn it off. The PayPal token never leaves the server.

export async function GET() {
  return handle(async () => ({ standing: await standingView(await currentHousehold()) }));
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("confirm"), setupTokenId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("revoke") }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    const household = await currentHousehold();
    if (a.action === "setup") return startStandingSetup(household, new URL(req.url).origin);
    if (a.action === "confirm") return { standing: await confirmStanding(household, a.setupTokenId) };
    return { standing: await revokeStanding(household) };
  });
}
