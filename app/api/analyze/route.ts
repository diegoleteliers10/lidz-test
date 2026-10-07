// @env node
import { Result } from "better-result";
import { analyzeConversation, configuredModel } from "@/lib/triage/gemini";
import { adaptFixtureConversation, TriageResult } from "@/lib/triage/schema";

export const runtime = "nodejs";

type ApiItem =
  | { id: string | null; ok: true; data: TriageResult; usage: { input_tokens: number; output_tokens: number; total_tokens: number } }
  | { id: string | null; ok: false; error: { code: string; message: string } };

const requestsByIp = new Map<string, number[]>();
const requestsPerMinute = 20;

function isRateLimited(ip: string, now: number): boolean {
  const active = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (active.length >= requestsPerMinute) {
    requestsByIp.set(ip, active);
    return true;
  }
  active.push(now);
  requestsByIp.set(ip, active);
  return false;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function analyzeItem(input: unknown): Promise<ApiItem> {
  const adapted = adaptFixtureConversation(input);
  if (Result.isError(adapted)) {
    const candidate = typeof input === "object" && input !== null && "id" in input ? input.id : null;
    return {
      id: typeof candidate === "string" ? candidate : null,
      ok: false,
      error: adapted.error,
    };
  }

  const analyzed = await analyzeConversation(adapted.value);
  if (Result.isError(analyzed)) {
    return {
      id: adapted.value.id,
      ok: false,
      error: analyzed.error,
    };
  }

  return {
    id: adapted.value.id,
    ok: true,
    data: analyzed.value.result,
    usage: analyzed.value.usage,
  };
}

async function analyzeBatch(items: unknown[]): Promise<ApiItem[]> {
  const output: ApiItem[] = [];
  for (let index = 0; index < items.length; index += 3) {
    const group = items.slice(index, index + 3);
    output.push(...(await Promise.all(group.map(analyzeItem))));
  }
  return output;
}

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(clientIp(request), Date.now())) {
    return Response.json(
      { error: { code: "rate_limited", message: "Too many requests. Try again in one minute." } },
      { status: 429 },
    );
  }

  const body = await Result.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: () => ({ code: "invalid_json", message: "Request body must contain valid JSON." } as const),
  });
  if (Result.isError(body)) {
    return Response.json({ error: body.error }, { status: 400 });
  }

  const items = Array.isArray(body.value) ? body.value : [body.value];
  if (items.length === 0 || items.length > 100) {
    return Response.json(
      { error: { code: "invalid_batch_size", message: "Send between 1 and 100 conversations." } },
      { status: 400 },
    );
  }

  const results = await analyzeBatch(items);
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

  return Response.json({
    results,
    model: configuredModel,
    usage,
    estimated_cost_usd: estimatedCost,
    cost_basis: estimatedCost === null ? "Price not configured for this model." : "Estimated with standard Gemini 3.1 Flash-Lite text rates: $0.25 input and $1.50 output per million tokens.",
  });
}
