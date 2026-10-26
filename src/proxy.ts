import { NextResponse, type NextRequest } from "next/server";
import { isVisitorId, VISITOR_COOKIE, visitorCookie } from "@/config/visitor";

// Hand each new browser its visitor id on its first request, and put the id on that
// request too, so the page and every API call after it agree on which demo is theirs.
export function proxy(request: NextRequest) {
  if (isVisitorId(request.cookies.get(VISITOR_COOKIE)?.value)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(VISITOR_COOKIE, id, visitorCookie);
  return response;
}

export const config = {
  // Pages and API routes only: not static files, and not PayPal's webhook calls.
  matcher: ["/((?!_next/static|_next/image|api/paypal/webhook|.*\\..*).*)"],
};
