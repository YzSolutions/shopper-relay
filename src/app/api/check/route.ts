import { readCheckoutScreenshot } from "@/lib/ai/terms";
import { decideChecked, FlowError } from "@/lib/purchases/service";
import { handle } from "@/lib/http";
import { saveCheck } from "@/lib/store/checks";
import { currentHousehold } from "@/lib/store/current";

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * "Check Before You Buy": read a screenshot of a checkout page. Only what was
 * read is kept; the image itself is never stored.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new FlowError("Choose a screenshot to check.");
    if (!TYPES.has(file.type)) throw new FlowError("Screenshots need to be PNG, JPEG or WebP images.");
    if (file.size > MAX_BYTES) throw new FlowError("That image is too large (6 MB at most).");

    const household = await currentHousehold();
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const terms = await readCheckoutScreenshot({ base64, mimeType: file.type });
    const [checkId, decided] = await Promise.all([saveCheck(household.id, terms.raw), decideChecked(household, terms.raw)]);
    return {
      checkId,
      // What the rules would do if it were bought, so the page can say so before the button.
      decision: decided?.decision ?? null,
      terms: terms.raw,
      recurring: terms.recurring,
      totalDueTodayCents: terms.totalDueTodayCents,
      recurringCents: terms.recurringCents,
    };
  });
}
