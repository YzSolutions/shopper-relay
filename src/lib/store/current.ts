import { cookies } from "next/headers";
import { DEMO_RELATIONSHIP, isRelationshipId, MODE_COOKIE, type RelationshipId } from "@/config/relationships";
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
