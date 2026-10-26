// Check the Gemini key, list usable models, and confirm structured JSON output works.
//
//   npm run gemini:check

import { existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "../src/lib/ai/gemini";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Set GEMINI_API_KEY in .env.local.");
  const model = AI_MODELS.careful[0];
  const ai = new GoogleGenAI({ apiKey });

  const usable: string[] = [];
  for await (const m of await ai.models.list()) {
    if (m.supportedActions?.includes("generateContent") && m.name && /gemini/.test(m.name)) usable.push(m.name.replace("models/", ""));
  }
  console.log(`Models this key can call (${usable.length}):\n  ${usable.join("\n  ")}\n`);
  for (const [speed, list] of Object.entries(AI_MODELS)) {
    console.log(`${speed}: ${list.map((m) => `${m} ${usable.includes(m) ? "(available)" : "(NOT available)"}`).join(", ")}`);
  }
  console.log();

  // A tiny structured-output test shaped like the real rule parser.
  const res = await ai.models.generateContent({
    model,
    contents:
      'Turn this into spending rules: "Under $75 I decide myself. Over $150 my daughter Sarah decides." ' +
      "List each amount range and who approves it. If any range is not covered, list it under gaps.",
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          bands: {
            type: "array",
            items: {
              type: "object",
              properties: {
                minDollars: { type: "number" },
                maxDollars: { type: ["number", "null"] },
                approver: { type: "string", enum: ["shopper", "reviewer"] },
              },
              required: ["minDollars", "maxDollars", "approver"],
            },
          },
          gaps: { type: "array", items: { type: "string" } },
        },
        required: ["bands", "gaps"],
      },
    },
  });
  console.log("Structured output test:");
  console.log(JSON.stringify(JSON.parse(res.text ?? "{}"), null, 2));
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
