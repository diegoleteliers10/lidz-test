import { triageResultSchema, type Conversation, type Evidence, type Fact, type TriageResult } from "./schema";

const downPaymentPattern = /\b(pie|cuota inicial|ahorro para el pie)\b/i;
const moneyMeaningPattern = /\b(presupuesto|máximo|maximo|tope|hasta|invertir|inversión|inversion)\b/i;

function evidenceMatches(conversation: Conversation, evidence: Evidence): boolean {
  const message = conversation.messages[evidence.message_index];
  return message !== undefined
    && message.speaker === evidence.speaker
    && message.text.includes(evidence.text);
}

function fieldMeaningMatches(path: string, evidence: Evidence): boolean {
  if (path.startsWith("human_escalation")) return evidence.speaker === "lead";
  if (path.endsWith("purchase_budget") || path.endsWith("investment_budget")) {
    return evidence.speaker === "lead"
      && moneyMeaningPattern.test(evidence.text)
      && !downPaymentPattern.test(evidence.text);
  }
  if (path.endsWith("down_payment")) {
    return evidence.speaker === "lead" && downPaymentPattern.test(evidence.text);
  }
  if (path.endsWith("assistant_quoted_price")) return evidence.speaker === "assistant";
  if (path.startsWith("profile") || path.startsWith("purchase_budget") || path.startsWith("property_requirements") || path.startsWith("urgency") || path.startsWith("intent") || path.startsWith("inventory_fit") || path.startsWith("visit") || path.startsWith("manipulation_attempt")) return evidence.speaker === "lead";
  return true;
}

function verifyFact<T>(conversation: Conversation, path: string, fact: Fact<T>): Fact<T> {
  if (fact.state !== "known") return fact;
  const valid = fact.evidence.every((evidence) => evidenceMatches(conversation, evidence) && fieldMeaningMatches(path, evidence));
  return valid ? fact : {
    state: "invalid",
    value: null,
    evidence: fact.evidence,
    issue: "Evidence does not support this field or does not match the source message.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFact(value: unknown): value is Fact<unknown> {
  return isRecord(value)
    && typeof value.state === "string"
    && Array.isArray(value.evidence)
    && (value.state === "known" || value.state === "unknown" || value.state === "contradictory" || value.state === "invalid");
}

function verifyObject(conversation: Conversation, value: unknown, path: string, invalidated: string[]): unknown {
  if (value === null || typeof value !== "object") return value;
  if (isFact(value)) {
    const verified = verifyFact(conversation, path, value);
    if (verified.state === "invalid" && value.state !== "invalid") invalidated.push(path);
    return verified;
  }
  if (Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    verifyObject(conversation, child, path ? `${path}.${key}` : key, invalidated),
  ]));
}

export function verifyEvidence(conversation: Conversation, result: TriageResult): TriageResult {
  const invalidated = [...result.invalidated_fields];
  const verifiedResult = triageResultSchema.safeParse(verifyObject(conversation, result, "", invalidated));
  const verified = verifiedResult.success ? verifiedResult.data : result;
  const invalidatedFields = [...new Set(invalidated)];
  const categoryEvidenceValid = verified.category_evidence.length > 0
    && verified.category_evidence.every((evidence) => evidenceMatches(conversation, evidence) && evidence.speaker === "lead");
  const leadEvidenceValid = verified.is_lead_evidence.every((evidence) => evidenceMatches(conversation, evidence) && evidence.speaker === "lead")
    && (verified.is_lead === null || verified.is_lead === false && verified.category === "out_of_scope" || verified.is_lead_evidence.length > 0);
  const missingClassificationEvidence = !categoryEvidenceValid || !leadEvidenceValid;
  return {
    ...verified,
    invalidated_fields: invalidatedFields,
    review_required: verified.review_required || invalidatedFields.length > 0 || missingClassificationEvidence,
    warnings: missingClassificationEvidence ? [...new Set([...verified.warnings, "Classification lacks valid source evidence."])] : verified.warnings,
  };
}
