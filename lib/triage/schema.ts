import { z } from "zod";
import { Result } from "better-result";

export const evidenceSchema = z.object({
  text: z.string().min(1),
  message_index: z.number().int().nonnegative(),
  speaker: z.enum(["lead", "assistant"]),
});

export const factSchema = <T extends z.ZodType>(value: T) => z.discriminatedUnion("state", [
  z.object({ state: z.literal("known"), value, evidence: z.array(evidenceSchema).min(1) }),
  z.object({ state: z.literal("unknown"), value: z.null(), evidence: z.array(evidenceSchema).length(0) }),
  z.object({ state: z.literal("contradictory"), value: z.null(), evidence: z.array(evidenceSchema).min(2), issue: z.string().min(1) }),
  z.object({ state: z.literal("invalid"), value: z.null(), evidence: z.array(evidenceSchema).min(1), issue: z.string().min(1) }),
]);

export const conversationSchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.object({ speaker: z.enum(["lead", "assistant"]), text: z.string() })).min(1),
});

const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.enum(["UF", "CLP"]),
  certainty: z.enum(["exact", "approximate", "upper_bound"]),
});
const purchaseBudgetSchema = moneySchema.extend({ type: z.literal("total") });
const propertyTypeSchema = z.enum(["studio", "apartment", "shop", "office", "warehouse", "land"]);
const deliverySchema = z.enum(["immediate", "dated", "undetermined"]);
const escalationReasonSchema = z.enum(["complaint", "manipulation_review", "subsidy_question", "outside_assistant_scope", "price_negotiation", "missed_visit", "commercial_advice_requested"]);
const handlingSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("assistant_can_continue"), reason: z.literal("standard_sales_response") }),
  z.object({ status: z.literal("human_intervention_required"), reason: z.union([escalationReasonSchema, z.literal("uncertain_classification")]) }),
  z.object({ status: z.literal("no_sales_call"), reason: z.enum(["rental_not_supported", "wrong_number", "unrelated_business", "information_only_without_purchase_interest", "no_relationship_with_company", "instruction_override_without_purchase_need"]) }),
]);

export const residentialProfileSchema = z.object({
  product: z.literal("residential"),
  net_monthly_income: factSchema(moneySchema),
  monthly_income: factSchema(moneySchema),
  down_payment: factSchema(moneySchema),
  monthly_payment: factSchema(moneySchema),
  declared_credit_capacity: factSchema(moneySchema),
  seeks_subsidy: factSchema(z.boolean()),
  subsidy_name: factSchema(z.string()),
  credit_preapproved: factSchema(z.boolean()),
  buys_for_investment: factSchema(z.boolean()),
  has_co_borrower: factSchema(z.boolean()),
});

export const commercialProfileSchema = z.object({
  product: z.literal("commercial"),
  business_sector: factSchema(z.string()),
  floor_area_m2: factSchema(z.number().finite().positive()),
  property_type: factSchema(z.enum(["office", "shop", "warehouse", "land"])),
  investment_budget: factSchema(purchaseBudgetSchema),
});

export const triageResultSchema = z.object({
  id: z.string(),
  category: z.enum(["owner_occupier_purchase", "investment_purchase", "commercial_purchase", "complaint", "inquiry", "out_of_scope"]),
  category_evidence: z.array(evidenceSchema),
  is_lead: z.boolean().nullable(),
  is_lead_evidence: z.array(evidenceSchema),
  out_of_scope_reason: z.enum(["rental_not_supported", "wrong_number", "unrelated_business", "information_only_without_purchase_interest", "no_relationship_with_company", "instruction_override_without_purchase_need"]).nullable(),
  profile: z.discriminatedUnion("product", [residentialProfileSchema, commercialProfileSchema]).nullable(),
  purchase_budget: factSchema(purchaseBudgetSchema),
  property_requirements: z.object({
    bedrooms: factSchema(z.number().int().positive()),
    bathrooms: factSchema(z.number().int().positive()),
    property_type: factSchema(propertyTypeSchema),
    delivery: factSchema(deliverySchema),
    delivery_date: factSchema(z.string()),
  }).nullable(),
  urgency: factSchema(z.enum(["immediate", "this_week", "soon", "dated", "no_urgency"])),
  intent: factSchema(z.enum(["high", "medium", "low"])),
  inventory_fit: factSchema(z.enum(["high", "medium", "low"])),
  visit: z.object({ scheduled: factSchema(z.boolean()), missed: factSchema(z.boolean()), date: factSchema(z.string()) }).nullable(),
  assistant_quoted_price: factSchema(moneySchema),
  human_escalation: factSchema(escalationReasonSchema),
  handling: handlingSchema,
  manipulation_attempt: factSchema(z.boolean()),
  priority: z.enum(["high", "medium", "low", "excluded", "review_required"]),
  score: z.number().finite().nullable(),
  should_call: z.boolean(),
  summary: z.string().nullable(),
  invalidated_fields: z.array(z.string()),
  review_required: z.boolean(),
  warnings: z.array(z.string()),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Fact<T> =
  | { state: "known"; value: T; evidence: Evidence[] }
  | { state: "unknown"; value: null; evidence: Evidence[] }
  | { state: "contradictory"; value: null; evidence: Evidence[]; issue: string }
  | { state: "invalid"; value: null; evidence: Evidence[]; issue: string };
export type Money = z.infer<typeof moneySchema>;
export type PurchaseBudget = z.infer<typeof purchaseBudgetSchema>;
export type ResidentialProfile = z.infer<typeof residentialProfileSchema>;
export type CommercialProfile = z.infer<typeof commercialProfileSchema>;
export type TriageResult = z.infer<typeof triageResultSchema>;
export type EscalationReason = z.infer<typeof escalationReasonSchema>;
export type Handling = z.infer<typeof handlingSchema>;
export type InputError = { code: "schema_invalid"; message: "Invalid conversation input." };

const fixtureConversationSchema = z.object({
  id: z.string().min(1),
  mensajes: z.array(z.object({ de: z.enum(["lead", "asistente", "assistant"]), texto: z.string() })).min(1),
});

export function adaptFixtureConversation(input: unknown) {
  const direct = conversationSchema.safeParse(input);
  if (direct.success) return Result.ok(direct.data);
  const fixture = fixtureConversationSchema.safeParse(input);
  if (!fixture.success) return Result.err({ code: "schema_invalid", message: "Invalid conversation input." } satisfies InputError);
  return Result.ok({
    id: fixture.data.id,
    messages: fixture.data.mensajes.map((message) => ({
      speaker: message.de === "lead" ? "lead" as const : "assistant" as const,
      text: message.texto,
    })),
  });
}
