import { cookies } from "next/headers";
import { DEMO_RELATIONSHIP, isRelationshipId, MODE_COOKIE, type RelationshipId } from "@/config/relationships";
import { isVisitorId, VISITOR_COOKIE, visitorCookie } from "@/config/visitor";
import { FlowError } from "../purchases/service";
import { demoHousehold, type Household } from "./households";

/** Which relationship this browser is looking at (no sign-in in the prototype). */
export async function currentMode(): Promise<RelationshipId> {
  const value = (await cookies()).get(MODE_COOKIE)?.value;
  return isRelationshipId(value) ? value : DEMO_RELATIONSHIP;
}

/**
 * This browser's visitor id. The proxy hands one out on the first request; a
 * direct API call that skipped it gets one here. Route handlers only.
 */
export async function currentVisitor(): Promise<string> {
  const jar = await cookies();
  const id = jar.get(VISITOR_COOKIE)?.value;
  if (isVisitorId(id)) return id;
  const fresh = crypto.randomUUID();
  jar.set(VISITOR_COOKIE, fresh, visitorCookie);
  return fresh;
}

/** This browser's own demo household for the relationship it is looking at. */
export async function currentHousehold(): Promise<Household> {
  return demoHousehold(await currentVisitor(), await currentMode());
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
