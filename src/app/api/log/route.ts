import { handle } from "@/lib/http";
import { householdLog } from "@/lib/store/events";
import { currentHousehold } from "@/lib/store/current";

/** The why log: every purchase step and rule change, newest first. */
export async function GET() {
  return handle(async () => ({ events: await householdLog((await currentHousehold()).id) }));
}
