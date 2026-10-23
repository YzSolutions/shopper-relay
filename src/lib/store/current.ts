import { cookies } from "next/headers";
import { DEMO_RELATIONSHIP, isRelationshipId, MODE_COOKIE, type RelationshipId } from "@/config/relationships";
import { FlowError } from "../purchases/service";
import { demoHousehold, type Household } from "./households";

/** Which relationship this browser is looking at (no sign-in in the prototype). */
export async function currentMode(): Promise<RelationshipId> {
  const value = (await cookies()).get(MODE_COOKIE)?.value;
  return isRelationshipId(value) ? value : DEMO_RELATIONSHIP;
}

/** The demo household for the relationship this browser is looking at. */
export async function currentHousehold(): Promise<Household> {
  return demoHousehold(await currentMode());
}

/**
 * A page left open in another tab may still be showing a different
 * relationship. Refuse rather than change the wrong household's rules.
 */
export function assertSameHousehold(current: string, expected: string | undefined): void {
  if (expected && expected !== current) {
    throw new FlowError("This page is out of date: the demo was switched in another tab. Reload the page and try again.", 409);
  }
}
