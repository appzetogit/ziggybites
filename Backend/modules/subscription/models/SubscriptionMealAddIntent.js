import mongoose from "mongoose";

/**
 * Pending payment when user adds/upgrades a meal on an active subscription.
 * Wallet portion is applied on confirm; Razorpay covers the remainder (min ₹1 when online share > 0).
 */
const subscriptionMealAddIntentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSubscription",
      required: true,
      index: true,
    },
    itemPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    /** Total amount user must cover (upgrade delta), paise */
    amountDuePaise: { type: Number, required: true, min: 0 },
    /** Wallet amount to deduct on confirm, paise */
    walletPlannedPaise: { type: Number, default: 0, min: 0 },
    /** Razorpay order amount (paise); 0 if wallet-only */
    razorpayAmountPaise: { type: Number, default: 0, min: 0 },
    razorpayOrderId: { type: String, default: null, index: true, sparse: true },
    /** When wallet covers full amount: optional Razorpay for full due (min ₹1 when due is small) */
    onlineOnlyRazorpayOrderId: { type: String, default: null, index: true, sparse: true },
    onlineOnlyAmountPaise: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    razorpayPaymentId: { type: String, default: null },
  },
  { timestamps: true },
);

subscriptionMealAddIntentSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model("SubscriptionMealAddIntent", subscriptionMealAddIntentSchema);
