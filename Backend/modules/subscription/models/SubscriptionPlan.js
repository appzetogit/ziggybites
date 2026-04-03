import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      unique: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    // Free-form text that powers the "What you get" list on the user side.
    benefits: { type: String, default: "" },
    // Legacy: fixed price (optional, for backward compatibility)
    price: { type: Number, default: null, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    active: { type: Boolean, default: true },
    // priceType: 'fixed' = use plan.price; 'dynamic' = compute from selected meals + delivery
    priceType: {
      type: String,
      enum: ["fixed", "dynamic"],
      default: "dynamic",
    },
    // Admin enables/disables meal types for this plan
    mealTypesEnabled: {
      breakfast: { type: Boolean, default: true },
      lunch: { type: Boolean, default: true },
      snacks: { type: Boolean, default: true },
      dinner: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
