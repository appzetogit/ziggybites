/** Meal categories required before a new user can purchase a subscription plan */
export const SUBSCRIPTION_REQUIRED_MEAL_CATEGORIES = ["breakfast", "lunch", "snacks", "dinner"]

/**
 * True when there is at least one selected item per required category (draft or saved items).
 */
export function hasCompleteMealSelection(items) {
  if (!items?.length) return false
  return SUBSCRIPTION_REQUIRED_MEAL_CATEGORIES.every((cat) =>
    items.some((i) => i.mealCategory === cat),
  )
}
