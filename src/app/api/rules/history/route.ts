import { handle } from "@/lib/http";
import { currentHousehold } from "@/lib/store/current";
import { ruleHistory } from "@/lib/store/ruleHistory";

/** Every rule change for this household, newest first. Read-only: there is no way to edit or delete it. */
export async function GET() {
  return handle(async () => {
    const household = await currentHousehold();
    return { history: await ruleHistory(household.id) };
  });
}
