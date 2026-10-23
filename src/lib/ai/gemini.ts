// One way to ask Gemini for structured JSON: schema-checked, retried, with a
// fallback model and a saved-answer cache. AI output is always validated with
// zod before anything else sees it, and never decides a payment on its own.

import { createHash } from "node:crypto";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { db } from "../db/client";

const DEFAULT_MODEL = "gemini-3.8-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const RETRYABLE = new Set([429, 500, 503, 504]);

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } });
  }
  return client;
}

function models(): string[] {
  const configured = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS?.split(",") ?? FALLBACK_MODELS).map((m) => m.trim()).filter(Boolean);
  return [...new Set([configured, ...fallbacks])];
}

/** zod -> the JSON Schema subset Gemini accepts. */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AiError extends Error {}

export interface AiResult<T> {
  data: T;
  model: string;
  cached: boolean;
}

export interface GenerateJsonArgs<S extends z.ZodType> {
  /** Names the job in the cache and in logs, e.g. "parse-rules". */
  task: string;
  schema: S;
  system: string;
  parts: Part[];
  /** Skip the saved-answer cache (for example while iterating on a prompt). */
  fresh?: boolean;
}

function cacheKey(task: string, system: string, parts: Part[]): string {
  return createHash("sha256").update(JSON.stringify([task, system, parts])).digest("hex");
}

async function readCache(key: string): Promise<{ model: string; response: unknown } | null> {
  try {
    const rows = await db()`select model, response from ai_cache where key = ${key}`;
    return (rows[0] as { model: string; response: unknown } | undefined) ?? null;
  } catch {
    return null; // a cache problem should never block the real call
  }
}

async function writeCache(key: string, task: string, model: string, response: unknown): Promise<void> {
  try {
    await db()`insert into ai_cache (key, task, model, response) values (${key}, ${task}, ${model}, ${JSON.stringify(response)}::jsonb) on conflict (key) do nothing`;
  } catch {
    // best effort
  }
}

export async function generateJson<S extends z.ZodType>({ task, schema, system, parts, fresh }: GenerateJsonArgs<S>): Promise<AiResult<z.infer<S>>> {
  const key = cacheKey(task, system, parts);
  if (!fresh) {
    const hit = await readCache(key);
    const parsed = hit && schema.safeParse(hit.response);
    if (hit && parsed?.success) return { data: parsed.data, model: hit.model, cached: true };
  }

  const responseJsonSchema = toGeminiSchema(schema);
  let lastError: unknown = null;
  for (const model of models()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await gemini().models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema, temperature: 0 },
        });
        const parsed = schema.safeParse(JSON.parse(res.text ?? "null"));
        if (!parsed.success) {
          lastError = new AiError(`${model} returned JSON that didn't match the schema: ${parsed.error.message}`);
          continue;
        }
        await writeCache(key, task, model, parsed.data);
        return { data: parsed.data, model, cached: false };
      } catch (err) {
        lastError = err;
        if (err instanceof ApiError && RETRYABLE.has(err.status)) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        if (err instanceof ApiError && err.status === 404) break; // model not available: try the next one
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
  throw new AiError(`Gemini couldn't complete "${task}": ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
