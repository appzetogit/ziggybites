import mongoose from "mongoose";

const subscriptionItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    image: String,
    isVeg: { type: Boolean, default: true },
    mealCategory: {
      type: String,
      enum: ['breakfast', 'lunch', 'snacks', 'dinner'],
      default: null,
    },
  },
  { _id: false }
);

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: String,
      required: true,
      index: true,
    },
    restaurantName: { type: String, required: true },
    planDays: {
      type: Number,
      required: true,
      min: 1,
    },
    autoPayEnabled: {
      type: Boolean,
      default: false,
    },
    queuedPlans: [
      {
        planDays: { type: Number, required: true },
        purchasedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ["queued", "activated"], default: "queued" },
      }
    ],
    status: {
      type: String,
      enum: ["active", "paused", "cancelled"],
      default: "active",
      index: true,
    },
    /** Set when user pauses meal deliveries (cron/notifications skip paused subs) */
    pausedAt: { type: Date, default: null },
    /** Timed pause: auto-resume when this instant passes */
    pauseUntil: { type: Date, default: null, index: true },
    /** Last pause action: skip_next_meal | 1_day | 7_days | indefinite | custom_range */
    pauseType: { type: String, trim: true, default: null },
    // Veg or non-veg slot (separate handling per ZigZagLite)
    deliverySlot: {
      type: String,
      enum: ["veg", "non_veg"],
      required: true,
    },
    items: {
      type: [subscriptionItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one item required",
      },
    },
    specialCookingInstructions: { type: String, default: "" },
    // Next delivery: 2hr before this we send notification and create pending order
    nextDeliveryAt: { type: Date, required: true, index: true },
    // Last time we sent 2hr-before notification (to avoid duplicates)
    lastNotifiedAt: { type: Date, default: null },
    // Pending order created for this delivery (user can modify/skip/confirm)
    pendingOrderId: { type: String, default: null },
    address: {
      label: String,
      street: String,
      city: String,
      state: String,
      zipCode: String,
      formattedAddress: String,
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },
    phoneNumber: String,
    startDate: { type: Date, default: Date.now },
    endDate: Date,
  },
  { timestamps: true }
);

userSubscriptionSchema.index({ nextDeliveryAt: 1, status: 1 });
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ status: 1, nextDeliveryAt: 1, endDate: 1, pauseUntil: 1 });

export default mongoose.model("UserSubscription", userSubscriptionSchema);
