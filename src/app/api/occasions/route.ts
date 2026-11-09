import { z } from "zod";
import { body, handle } from "@/lib/http";
import { shopForOccasion } from "@/lib/purchases/occasions";
import { FlowError } from "@/lib/purchases/service";
import { currentHousehold } from "@/lib/store/current";
import { dayWords, shopDay } from "@/lib/client/occasions";
import { logEvent } from "@/lib/store/events";
import { addOccasion, listOccasions, removeOccasion } from "@/lib/store/occasions";
import { purchaseView } from "@/lib/views";

// "Shop now" runs the AI Shopper: a few Gemini turns and catalog searches, then PayPal.
export const maxDuration = 60;

async function aiHousehold() {
  const household = await currentHousehold();
  if (household.relationship !== "ai_shopper") throw new FlowError("Occasions are part of the AI Shopper setup.", 409);
  return household;
}

/** The owner's occasions, each with what the AI did for it so far. */
export async function GET() {
  return handle(async () => ({ occasions: await listOccasions((await aiHousehold()).id) }));
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "Not a real date.");
const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    title: z.string().trim().min(2).max(80),
    date: Day,
    job: z.string().trim().min(2).max(200),
    daysAhead: z.number().int().min(0).max(60),
  }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
  z.object({ action: z.literal("shop"), id: z.uuid() }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const a = await body(req, Action);
    const household = await aiHousehold();
    if (a.action === "add") {
      if (!(await addOccasion(household.id, a))) throw new FlowError("That's as many occasions as this demo keeps. Remove one to add another.", 409);
      await logEvent({
        householdId: household.id,
        type: "occasion_added",
        actor: "reviewer",
        message: `${household.reviewerName} put ${a.title} on the calendar for ${dayWords(a.date)}: ${a.job}. The AI shops for it on ${dayWords(shopDay(a.date, a.daysAhead))}.`,
      });
    } else if (a.action === "remove") {
      await removeOccasion(household.id, a.id);
    } else {
      const run = await shopForOccasion(a.id, household.id);
      if (!run) throw new FlowError("The AI has already shopped for this one.", 409);
      const occasions = await listOccasions(household.id);
      return { occasions, steps: run.steps, purchase: run.purchase && purchaseView(run.purchase) };
    }
    return { occasions: await listOccasions(household.id) };
  });
}
