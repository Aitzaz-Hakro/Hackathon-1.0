/**
 * Smoke test for the Gemini Interactions API (structured output).
 *
 * Run: npx tsx --env-file=.env scripts/smoke-gemini.ts
 *
 * Prints the HTTP status and the raw JSON body so we can confirm:
 *  1. the key works, 2. the model is accessible, 3. the response envelope shape.
 */

const MODEL = process.argv[2] ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is not set in .env — add it first.");
    process.exit(1);
  }

  const body = {
    model: MODEL,
    input:
      'Today is Thursday 2026-10-01 (UTC). Extract booking JSON for: "Book the Embedded Systems Lab Friday 2-4pm for 5 Arduino kits for a capstone demo".',
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          labHint: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          start: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
          purpose: { type: "string" },
          equipment: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nameHint: { type: "string" },
                quantity: { type: "integer" },
              },
              required: ["nameHint", "quantity"],
            },
          },
        },
        required: ["labHint", "date", "start", "end", "purpose", "equipment"],
      },
    },
  };

  const started = Date.now();
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  console.log(`status ${response.status} in ${Date.now() - started}ms`);
  console.log(JSON.stringify(await response.json(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
