// The prototype has no sign-in, so each browser gets a random id and its own copy of the
// demo households. Kept apart from the rest of the config so the proxy stays small.

export const VISITOR_COOKIE = "sr_visitor";

export const visitorCookie = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  // Long enough to last through judging.
  maxAge: 60 * 60 * 24 * 120,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVisitorId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
