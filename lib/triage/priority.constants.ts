export const priorityWeights = {
  version: "normalized-v2",
  urgency: { no_urgency: 2 / 3, soon: 11 / 15, dated: 4 / 5, this_week: 13 / 15, immediate: 1 },
  intent: { low: 7 / 13, medium: 10 / 13, high: 1 },
  fit: { low: 7 / 12, medium: 5 / 6, high: 1 },
  category: { owner_occupier_purchase: 26 / 27, investment_purchase: 1, commercial_purchase: 20 / 27, complaint: 26 / 27, inquiry: 20 / 27 },
  budget: {
    residential: { small: 11 / 26, medium: 8 / 13, large: 21 / 26, largest: 1, unknown: 10 / 13 },
    commercial: { small: 12 / 29, medium: 17 / 29, large: 23 / 29, largest: 1, unknown: 20 / 29 },
  },
  income: { unknown: 4 / 5, declared: 22 / 25, preapproved: 1 },
  downPayment: { unknown: 20 / 23, positive: 1 },
  area: { small: 5 / 7, medium: 11 / 14, large: 25 / 28, largest: 1 },
  budgetPresence: { known: 1, unknown: 0.85 },
} as const;
