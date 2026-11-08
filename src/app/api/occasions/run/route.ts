import { handle } from "@/lib/http";
import { shopDueOccasions } from "@/lib/purchases/occasions";

// The daily run (a Vercel cron, see vercel.json): the AI shops for every occasion
// whose shop-ahead day has come. A few at a time, each a full AI Shopper run.
export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    // Vercel sends the project's CRON_SECRET; without one set, nobody can start a run.
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed." }, { status: 401 });
    // shortcut: "today" is the UTC date, so a run near midnight can be a day off for US time zones; fine for a daily shop-ahead.
    return shopDueOccasions(new Date().toISOString().slice(0, 10));
  });
}
