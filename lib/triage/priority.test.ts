import { describe, expect, it } from "vitest";
import saved from "../data/triage-results.json";
import { applyPriorityPolicy, priorityFromScore } from "./priority";
import { priorityWeights } from "./priority.constants";
import { residentialProfileSchema, triageResultSchema, type Fact, type PurchaseBudget, type TriageResult } from "./schema";

function known<T>(value: T): Fact<T> {
  return { state: "known", value, evidence: [{ text: "test", message_index: 0, speaker: "lead" }] };
}

function unknown<T>(): Fact<T> {
  return { state: "unknown", value: null, evidence: [] };
}

function residentialProfile() {
  return residentialProfileSchema.parse({
    product: "residential",
    net_monthly_income: unknown(), monthly_income: unknown(), down_payment: unknown(),
    monthly_payment: unknown(), declared_credit_capacity: unknown(), seeks_subsidy: unknown(),
    subsidy_name: unknown(), credit_preapproved: unknown(), buys_for_investment: unknown(), has_co_borrower: unknown(),
  });
}

function lead(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    ...triageResultSchema.parse(saved.results[0].data),
    category: "investment_purchase", profile: null,
    purchase_budget: known({ amount: 9000, currency: "UF", certainty: "exact", type: "total" }),
    urgency: known("immediate"), intent: known("high"), inventory_fit: known("high"),
    human_escalation: unknown(), manipulation_attempt: unknown(),
    review_required: false, invalidated_fields: [], is_lead: true,
    ...overrides,
  };
}

function numericWeights(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(numericWeights);
}

describe("normalized priority policy", () => {
  it("keeps every configured factor between zero and one", () => {
    for (const weight of numericWeights(priorityWeights)) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("reaches 100 for a fully supported investment purchase", () => {
    const result = applyPriorityPolicy(lead({
      profile: { ...residentialProfile(), monthly_income: known({ amount: 2000000, currency: "CLP", certainty: "exact" }), credit_preapproved: known(true), down_payment: known({ amount: 1000, currency: "UF", certainty: "exact" }) },
    }));
    expect(result).toMatchObject({ score: 100, priority: "high", should_call: true });
  });

  it("does not reward removal of an unknown residential or commercial profile", () => {
    expect(applyPriorityPolicy(lead()).score).toBe(applyPriorityPolicy(lead({ profile: residentialProfile() })).score);
    const commercial = { product: "commercial", business_sector: unknown<string>(), floor_area_m2: unknown<number>(), property_type: unknown<"office">(), investment_budget: unknown<PurchaseBudget>() } as const;
    expect(applyPriorityPolicy(lead({ category: "commercial_purchase" })).score).toBe(applyPriorityPolicy(lead({ category: "commercial_purchase", profile: commercial })).score);
  });

  it("does not reward an unknown intent over a declared medium intent", () => {
    expect(applyPriorityPolicy(lead({ intent: unknown() })).score).toBe(applyPriorityPolicy(lead({ intent: known("medium") })).score);
    expect(applyPriorityPolicy(lead({ intent: known("high") })).score).toBeGreaterThan(applyPriorityPolicy(lead({ intent: known("medium") })).score ?? 0);
  });

  it("keeps inclusive budget tiers and increases the score across their boundaries", () => {
    for (const category of ["investment_purchase", "commercial_purchase"] as const) {
      const boundaries = category === "commercial_purchase" ? [5000, 12000, 25000] : [2500, 4500, 7000];
      for (const amount of boundaries) {
        const atBoundary = applyPriorityPolicy(lead({ category, purchase_budget: known({ amount, currency: "UF", certainty: "exact", type: "total" }) }));
        const below = applyPriorityPolicy(lead({ category, purchase_budget: known({ amount: amount - 1, currency: "UF", certainty: "exact", type: "total" }) }));
        const above = applyPriorityPolicy(lead({ category, purchase_budget: known({ amount: amount + 1, currency: "UF", certainty: "exact", type: "total" }) }));
        expect(atBoundary.score).toBe(below.score);
        expect(above.score).toBeGreaterThan(atBoundary.score ?? 0);
      }
    }
  });

  it("keeps preapproval dependent on declared income", () => {
    const baseline = lead({ profile: residentialProfile() });
    const preapproved = lead({ profile: { ...residentialProfile(), credit_preapproved: known(true) } });
    expect(applyPriorityPolicy(preapproved).score).toBe(applyPriorityPolicy(baseline).score);
  });

  it("matches recalculated examples and preserves handling overrides", () => {
    expect(saved.priority_policy_version).toBe(priorityWeights.version);
    const expected = [31, 0, 30, 0, 34, 10, 21, 100, 0, 13];
    for (const [index, item] of saved.results.entries()) {
      const original = triageResultSchema.parse(item.data);
      const result = applyPriorityPolicy(original);
      expect(result.score).toBe(expected[index]);
      expect(result.score).toBe(original.score);
      expect(result.handling).toEqual(original.handling);
      expect(result.should_call).toBe(original.should_call);
    }
    expect(applyPriorityPolicy(lead({ review_required: true }))).toMatchObject({ score: 50, priority: "review_required", should_call: false });
  });

  it("preserves the score bands", () => {
    expect([0, 40, 41, 80, 81, 100].map(priorityFromScore)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });
});
