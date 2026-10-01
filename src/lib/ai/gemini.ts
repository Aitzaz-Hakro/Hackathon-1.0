import { responseJsonSchema } from "./schema";

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export class AssistantUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantUnavailableError";
  }
}

/**
 * One structured-output call to the Gemini Interactions API.
 * Returns the raw output text (JSON string matching `responseJsonSchema`).
 */
export async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AssistantUnavailableError("GEMINI_API_KEY is not configured.");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: responseJsonSchema,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AssistantUnavailableError("The assistant timed out.");
  }

  if (!response.ok) throw new AssistantUnavailableError(`Gemini responded with ${response.status}.`);

  const body: unknown = await response.json();
  const text = extractOutputText(body);
  if (!text) throw new AssistantUnavailableError("The Gemini response contained no output text.");
  return text;
}

/**
 * Tolerant reader for the Interactions response envelope: finds the first
 * string anywhere in the payload that parses as a JSON object. The exact
 * envelope field is confirmed by `scripts/smoke-gemini.ts`; keeping this in
 * one place means a shape change is a one-line fix.
 */
export function extractOutputText(body: unknown): string | null {
  return findJsonString(body, 0);
}

function findJsonString(value: unknown, depth: number): string | null {
  if (depth > 6) return null;
  if (typeof value === "string") return isJsonObject(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = ["output_text", "outputText", "text", "content", "outputs", "steps", "response"];
    for (const key of preferred) {
      if (key in record) {
        const found = findJsonString(record[key], depth + 1);
        if (found) return found;
      }
    }
    for (const item of Object.values(record)) {
      const found = findJsonString(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function isJsonObject(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
