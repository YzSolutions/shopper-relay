import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AiError } from "./ai/gemini";
import { PayPalError } from "./paypal/client";
import { FlowError } from "./purchases/service";

/**
 * Run a route handler body and turn known failures into clear JSON errors.
 * Every API route reads live data, so none of them is prerendered at build time.
 */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  await connection();
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (err) {
    unstable_rethrow(err); // let Next.js handle its own control-flow errors
    if (err instanceof FlowError) return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return Response.json({ error: "That request wasn't valid.", issues: err.issues }, { status: 400 });
    if (err instanceof AiError) return Response.json({ error: "The AI assistant is busy right now. Please try again in a moment." }, { status: 503 });
    if (err instanceof PayPalError) {
      console.error("PayPal error", err.status, JSON.stringify(err.body));
      return Response.json({ error: "PayPal couldn't complete that step. Nothing was charged." }, { status: 502 });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}
