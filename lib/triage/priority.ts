import type { EscalationReason, Fact, TriageResult } from "./schema";

export const priorityWeights = {
  version: "provisional-v1",
  urgency: { no_urgency: 1, soon: 1.1, dated: 1.2, this_week: 1.3, immediate: 1.5 },
  intent: { low: 0.7, medium: 1, high: 1.3 },
  fit: { low: 0.7, medium: 1, high: 1.2 },
  category: { owner_occupier_purchase: 1.3, investment_purchase: 1.35, commercial_purchase: 1, complaint: 1.3, inquiry: 1 },
} as const;

function known<T>(fact: Fact<T>): T | null {
  return fact.state === "known" ? fact.value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function priorityFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 81) return "high";
  if (score >= 41) return "medium";
  return "low";
}

function conciseSummary(result: TriageResult): string {
  const escalation = known(result.human_escalation);
  if (known(result.manipulation_attempt) === true || escalation === "manipulation_review") {
    return "Intenta alterar las instrucciones; requiere revisión interna antes de responder.";
  }
  if (result.review_required || result.invalidated_fields.length > 0) {
    if (result.invalidated_fields.length > 0) return "Hay datos de la conversación sin validar; requiere revisión humana antes de decidir.";
    if (result.warnings.some((warning) => warning.includes("valid source evidence"))) return "La clasificación no tiene evidencia válida; requiere revisión humana.";
    return "Falta evidencia suficiente para confirmar la clasificación; requiere revisión humana.";
  }
  if (result.category === "out_of_scope") {
    const outOfScopeSummary = {
      rental_not_supported: "Busca arriendo; el producto es solo venta.",
      wrong_number: "Indica que se equivocó de número; no requiere contacto comercial.",
      unrelated_business: "Consulta ajena a la venta de propiedades.",
      information_only_without_purchase_interest: "Busca información sin expresar interés de compra.",
      no_relationship_with_company: "No reconoce relación con la inmobiliaria.",
      instruction_override_without_purchase_need: "Intenta alterar las instrucciones; requiere revisión interna.",
    };
    return outOfScopeSummary[result.out_of_scope_reason ?? "unrelated_business"];
  }
  if (result.category === "complaint") {
    const missedVisit = known(result.visit?.missed ?? { state: "unknown", value: null, evidence: [] }) === true;
    return missedVisit ? "Reporta una visita no realizada; requiere contacto humano." : "Reporta un problema de atención que requiere seguimiento humano.";
  }
  if (escalation !== null) {
    const summaries = {
      complaint: "Reporta un reclamo; requiere atención humana.",
      manipulation_review: "La conversación requiere revisión interna antes de responder.",
      subsidy_question: "Consulta sobre subsidio; requiere confirmación humana.",
      outside_assistant_scope: "Consulta fuera del alcance del asistente; requiere atención humana.",
      price_negotiation: "Solicita negociar el precio; requiere aprobación humana.",
      missed_visit: "Reporta una visita no realizada; requiere contacto humano.",
      commercial_advice_requested: "Solicita asesoría comercial; requiere atención humana.",
    };
    return summaries[escalation];
  }
  const category = {
    owner_occupier_purchase: "Busca comprar para vivir",
    investment_purchase: "Busca comprar como inversión",
    commercial_purchase: "Consulta por una compra comercial",
    inquiry: "Consulta por un proyecto",
    complaint: "Reporta un problema de atención",
    out_of_scope: "Consulta fuera del alcance de venta",
  }[result.category];
  const budget = known(result.purchase_budget);
  const urgency = known(result.urgency);
  const details = [
    budget ? `presupuesto declarado ${budget.currency} ${budget.amount.toLocaleString("es-CL")}` : null,
    urgency === "immediate" || urgency === "this_week" ? "urgencia declarada" : null,
  ].filter((detail) => detail !== null);
  return details.length ? `${category}; ${details.join(", ")}.` : `${category}.`;
}

function hasMissedVisitAndDelay(result: TriageResult): boolean {
  return result.category === "complaint"
    && !result.review_required
    && result.invalidated_fields.length === 0
    && result.category_evidence.length > 0
    && known(result.visit?.missed ?? { state: "unknown", value: null, evidence: [] }) === true;
}

function financialFactor(result: TriageResult): number {
  const budget = known(result.purchase_budget);
  let amountFactor = 1;
  if (budget?.currency === "UF") {
    if (result.category === "commercial_purchase") {
      amountFactor = budget.amount <= 5_000 ? 0.6 : budget.amount <= 12_000 ? 0.85 : budget.amount <= 25_000 ? 1.15 : 1.45;
    } else {
      amountFactor = budget.amount <= 2_500 ? 0.55 : budget.amount <= 4_500 ? 0.8 : budget.amount <= 7_000 ? 1.05 : 1.3;
    }
  }
  const profile = result.profile;
  if (profile?.product === "residential") {
    const hasIncome = profile.monthly_income.state === "known";
    const hasPreapproval = known(profile.credit_preapproved);
    const income = hasIncome ? hasPreapproval === true ? 1.25 : 1.1 : 1;
    const downPayment = known(profile.down_payment);
    return amountFactor * income * (downPayment && downPayment.amount > 0 ? 1.15 : 1);
  }
  if (profile?.product === "commercial") {
    const area = known(profile.floor_area_m2);
    const areaFactor = area === null ? 1 : area <= 100 ? 1 : area <= 300 ? 1.1 : area <= 1_000 ? 1.25 : 1.4;
    return amountFactor * areaFactor;
  }
  return amountFactor;
}

export function applyPriorityPolicy(result: TriageResult): TriageResult {
  result = { ...result, human_escalation: deriveHumanEscalation(result) };
  if (hasMissedVisitAndDelay(result)) {
    return { ...result, priority: "high", score: 100, handling: { status: "human_intervention_required", reason: "missed_visit" }, should_call: true, summary: conciseSummary(result) };
  }
  if (known(result.manipulation_attempt) === true || known(result.human_escalation) === "manipulation_review") {
    return { ...result, priority: "review_required", score: 0, handling: { status: "no_sales_call", reason: "instruction_override_without_purchase_need" }, should_call: false, summary: conciseSummary(result), review_required: true, warnings: [...new Set([...result.warnings, "Instruction override needs internal review."])] };
  }
  if (result.category === "out_of_scope") {
    return { ...result, priority: "excluded", score: 0, handling: { status: "no_sales_call", reason: result.out_of_scope_reason ?? "unrelated_business" }, should_call: false, summary: conciseSummary(result) };
  }
  if (result.review_required || result.invalidated_fields.length > 0) {
    return { ...result, priority: "review_required", score: 50, handling: { status: "human_intervention_required", reason: "uncertain_classification" }, should_call: false, summary: conciseSummary(result), review_required: true };
  }
  if (result.is_lead === null) {
    return { ...result, priority: "review_required", score: 50, handling: { status: "human_intervention_required", reason: "uncertain_classification" }, should_call: false, summary: conciseSummary(result), review_required: true };
  }

  const urgency = known(result.urgency);
  const intent = known(result.intent);
  const fit = known(result.inventory_fit);
  const interestFactor = clamp(
    (urgency ? priorityWeights.urgency[urgency] : 1)
      * (intent ? priorityWeights.intent[intent] : 1)
      * (fit ? priorityWeights.fit[fit] : 1),
    0.3,
    1.5,
  );
  const weightedScore = 100 * clamp(financialFactor(result), 0.3, 1.5) * interestFactor * priorityWeights.category[result.category] * (known(result.purchase_budget) ? 1 : 0.85);
  const score = Math.round(clamp(weightedScore / 2, 0, 100));
  const priority = priorityFromScore(score);
  const escalation = known(result.human_escalation);
  const handling = result.category === "complaint"
    ? { status: "human_intervention_required" as const, reason: "complaint" as const }
    : escalation !== null
      ? { status: "human_intervention_required" as const, reason: escalation }
      : { status: "assistant_can_continue" as const, reason: "standard_sales_response" as const };
  return { ...result, priority, score, handling, should_call: result.is_lead, summary: conciseSummary(result) };
}

function deriveHumanEscalation(result: TriageResult): Fact<EscalationReason> {
  if (result.human_escalation.state !== "unknown") return result.human_escalation;
  if (result.review_required || result.invalidated_fields.length > 0) return result.human_escalation;
  if (known(result.manipulation_attempt) === true) {
    return { state: "known", value: "manipulation_review", evidence: result.manipulation_attempt.evidence };
  }
  if (result.category === "complaint") {
    const missedVisit = result.visit?.missed;
    if (missedVisit?.state === "known" && missedVisit.value) {
      return { state: "known", value: "missed_visit", evidence: missedVisit.evidence };
    }
    return { state: "known", value: "complaint", evidence: result.category_evidence };
  }
  if (result.profile?.product === "residential" && known(result.profile.seeks_subsidy) === true) {
    return { state: "known", value: "subsidy_question", evidence: result.profile.seeks_subsidy.evidence };
  }
  return result.human_escalation;
}
