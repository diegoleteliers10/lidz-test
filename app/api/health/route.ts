import { configuredModel } from "@/lib/triage/gemini";

export function GET(): Response {
  return Response.json({ status: "ok", model: configuredModel});
}
