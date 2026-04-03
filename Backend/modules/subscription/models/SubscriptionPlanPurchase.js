import mongoose from "mongoose";

const subscriptionPlanPurchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planDays: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    amount: { type: Number, required: true }, // in paise
    razorpayOrderId: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, required: true },
    razorpaySignature: { type: String, required: true },
    status: { type: String, enum: ["paid"], default: "paid" },
  },
  { timestamps: true }
);

subscriptionPlanPurchaseSchema.index({ userId: 1, planDays: 1 });

export default mongoose.model("SubscriptionPlanPurchase", subscriptionPlanPurchaseSchema);
