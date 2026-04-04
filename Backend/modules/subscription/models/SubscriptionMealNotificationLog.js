import mongoose from "mongoose";

const subscriptionMealNotificationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSubscription",
      required: true,
      index: true,
    },
    scheduledMealAt: {
      type: Date,
      required: true,
      index: true,
    },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "snacks", "dinner"],
      required: true,
    },
    leadMinutes: {
      type: Number,
      required: true,
      default: 120,
    },
    status: {
      type: String,
      enum: ["processing", "sent", "failed", "skipped"],
      default: "processing",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    sentAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null, index: true },
    failReason: { type: String, default: "" },
    pushSummary: {
      successCount: { type: Number, default: 0 },
      failureCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

subscriptionMealNotificationLogSchema.index(
  { userSubscriptionId: 1, scheduledMealAt: 1, mealType: 1, leadMinutes: 1 },
  { unique: true, name: "uniq_subscription_meal_notification" },
);

subscriptionMealNotificationLogSchema.index({ status: 1, nextRetryAt: 1 });

export default mongoose.model(
  "SubscriptionMealNotificationLog",
  subscriptionMealNotificationLogSchema,
);

