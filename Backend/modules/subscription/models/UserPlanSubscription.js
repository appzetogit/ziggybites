import mongoose from "mongoose";

/**
 * UserPlanSubscription – Tracks plan-only subscription state (15/30/90 day access).
 * Separate from UserSubscription (meal delivery). Supports:
 * - Advance recharge (add days to endDate)
 * - Queued plans (upgrade: longer plan activates after current ends)
 * - Auto-pay mandate
 * - 7-day cancellation window
 */
const queuedPlanSchema = new mongoose.Schema(
  {
    planDays: { type: Number, required: true, min: 1 },
    purchasedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["queued", "activated"], default: "queued" },
  },
  { _id: false }
);

const userPlanSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    endDate: { type: Date, required: true, index: true },
    currentPlanDays: { type: Number, default: null },
    autoPayEnabled: { type: Boolean, default: false },
    queuedPlans: { type: [queuedPlanSchema], default: [] },
    firstPurchaseAt: { type: Date, required: true },
    cancellationRequestedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "cancelled", "cancelled_renewal"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

userPlanSubscriptionSchema.index({ endDate: 1, status: 1 });
userPlanSubscriptionSchema.index({ userId: 1, status: 1 });

export default mongoose.model("UserPlanSubscription", userPlanSubscriptionSchema);
