import { writeFile } from "node:fs/promises";
import { Result } from "better-result";
import conversations from "@/lib/data/conversations.json";
import { analyzeConversation, configuredModel } from "@/lib/triage/gemini";
import { adaptFixtureConversation, type TriageResult } from "@/lib/triage/schema";

type OutputItem =
  | { id: string; ok: true; data: TriageResult; usage: { input_tokens: number; output_tokens: number; total_tokens: number } }
  | { id: string; ok: false; error: { code: string; message: string } };

async function analyzeFixtures(): Promise<void> {
  const results: OutputItem[] = [];
  for (let index = 0; index < conversations.length; index += 3) {
    const batch = conversations.slice(index, index + 3);
    const analyzed = await Promise.all(batch.map(async (fixture) => {
      const adapted = adaptFixtureConversation(fixture);
      if (Result.isError(adapted)) {
        return { id: fixture.id, ok: false, error: adapted.error } satisfies OutputItem;
      }
      const response = await analyzeConversation(adapted.value);
      if (Result.isError(response)) {
        return { id: fixture.id, ok: false, error: response.error } satisfies OutputItem;
      }
      return {
        id: fixture.id,
        ok: true,
        data: response.value.result,
        usage: response.value.usage,
      } satisfies OutputItem;
    }));
    results.push(...analyzed);
  }

  const usage = results.reduce((total, item) => item.ok
    ? {
      input_tokens: total.input_tokens + item.usage.input_tokens,
      output_tokens: total.output_tokens + item.usage.output_tokens,
      total_tokens: total.total_tokens + item.usage.total_tokens,
    }
    : total, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  const estimatedCost = configuredModel === "gemini-3.1-flash-lite"
    ? (usage.input_tokens * 0.25 + usage.output_tokens * 1.5) / 1_000_000
    : null;
  const output = {
    model: configuredModel,
    generated_at: new Date().toISOString(),
    source: "lib/data/conversations.json",
    usage,
    estimated_cost_usd: estimatedCost,
    cost_basis: estimatedCost === null ? "Price not configured for this model." : "Estimated with standard Gemini 3.1 Flash-Lite text rates: $0.25 input and $1.50 output per million tokens.",
    results,
  };

  const saved = await Result.tryPromise({
    try: () => writeFile("lib/data/triage-results.json", JSON.stringify(output, null, 2) + "\n"),
    catch: () => ({ code: "output_write_failed", message: "Could not write lib/data/triage-results.json." } as const),
  });
  if (Result.isError(saved)) {
    process.stderr.write(`${saved.error.message}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Saved ${results.length} conversations. Tokens: ${usage.total_tokens}. Estimated cost: ${estimatedCost === null ? "unavailable" : `$${estimatedCost.toFixed(6)} USD`}.\n`);
  if (results.some((item) => !item.ok)) process.exitCode = 1;
}

await analyzeFixtures();
