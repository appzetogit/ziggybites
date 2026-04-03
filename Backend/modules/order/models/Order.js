import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: {
      type: String,
    },
    description: {
      type: String,
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    // Selected variant when item has variations (e.g. size, add-on)
    selectedVariation: {
      variationId: { type: String },
      variationName: { type: String },
      price: { type: Number },
    },
    subCategory: {
      type: String,
      default: "",
    },
  },
  { _id: true },
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: String,
      required: true,
    },
    restaurantName: {
      type: String,
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Order must have at least one item",
      },
    },
    deliveryInstructions: {
      type: String,
      default: "",
    },
    address: {
      label: {
        type: String,
        enum: ["Home", "Office", "Other"],
      },
      street: String,
      additionalDetails: String,
      city: String,
      state: String,
      zipCode: String,
      formattedAddress: String, // Complete formatted address from live location
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0],
        },
      },
    },
    // Snapshot fields for delivery details
    deliveryAddress: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    alternatePhone: {
      type: String,
    },
    deliveryInstructions: {
      type: String,
    },
    pricing: {
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },
      deliveryFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      platformFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      tax: {
        type: Number,
        default: 0,
        min: 0,
      },
      discount: {
        type: Number,
        default: 0,
        min: 0,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
      },
      couponCode: {
        type: String,
      },
    },
    payment: {
      method: {
        type: String,
        enum: ["razorpay", "cash", "wallet", "upi", "card"],
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed", "refunded"],
        default: "pending",
      },
      razorpayOrderId: {
        type: String,
      },
      razorpayPaymentId: {
        type: String,
      },
      razorpaySignature: {
        type: String,
      },
      transactionId: {
        type: String,
      },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "scheduled",
        "assigned",
        "picked",
        "skipped",
      ],
      default: "pending",
    },
    tracking: {
      confirmed: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      preparing: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      ready: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      outForDelivery: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      delivered: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
    },
    deliveryFleet: {
      type: String,
      enum: ["standard", "fast", "pure_veg"],
      default: "standard",
    },
    note: {
      type: String,
    },
    // ZigZagLite: special cooking instructions for vendor (Boil Only, Less Salt, Extra Spicy, Add Lemon, etc.)
    specialCookingInstructions: {
      type: String,
      default: "",
    },
    // Order source: one_time or subscription (subscription orders auto-generated 2hr before slot)
    source: {
      type: {
        type: String,
        enum: ["one_time", "subscription"],
        default: "one_time",
      },
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UserSubscription",
        default: null,
      },
    },
    sendCutlery: {
      type: Boolean,
      default: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    estimatedDeliveryTime: {
      type: Number, // in minutes
      default: 30,
    },
    // Enhanced ETA tracking
    eta: {
      min: {
        type: Number, // minimum ETA in minutes
        default: 25,
      },
      max: {
        type: Number, // maximum ETA in minutes
        default: 30,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      additionalTime: {
        type: Number, // Additional time added by restaurant (in minutes)
        default: 0,
      },
    },
    // Preparation time from menu items
    preparationTime: {
      type: Number, // Maximum preparation time from order items (in minutes)
      default: 0,
    },
    deliveredAt: {
      type: Date,
    },
    billImageUrl: {
      type: String,
      default: null,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
      type: String,
      enum: ["user", "restaurant", "admin"],
      default: null,
    },
    // Customer Review and Rating
    review: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        sparse: true,
      },
      comment: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      submittedAt: {
        type: Date,
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        sparse: true,
      },
    },
    assignmentInfo: {
      restaurantId: String,
      distance: Number, // Distance in km
      assignedBy: {
        type: String,
        enum: [
          "zone_match",
          "nearest_distance",
          "manual",
          "nearest_available",
          "delivery_accept",
        ],
      },
      zoneId: String,
      zoneName: String,
      deliveryPartnerId: String,
      assignedAt: Date,
    },
    deliveryState: {
      status: {
        type: String,
        enum: [
          "pending",
          "accepted",
          "reached_pickup",
          "order_confirmed",
          "en_route_to_delivery",
          "delivered",
        ],
        default: "pending",
      },
      currentPhase: {
        type: String,
        enum: [
          "assigned",
          "en_route_to_pickup",
          "at_pickup",
          "en_route_to_delivery",
          "at_delivery",
          "completed",
        ],
        default: "assigned",
      },
      acceptedAt: Date,
      reachedPickupAt: Date,
      orderIdConfirmedAt: Date,
      routeToPickup: {
        coordinates: [[Number]], // [[lat, lng], ...]
        distance: Number, // in km
        duration: Number, // in minutes
        calculatedAt: Date,
        method: String, // 'osrm', 'dijkstra', 'haversine_fallback'
      },
      routeToDelivery: {
        coordinates: [[Number]], // [[lat, lng], ...]
        distance: Number, // in km
        duration: Number, // in minutes
        calculatedAt: Date,
        method: String, // 'osrm', 'dijkstra', 'haversine'
      },
    },
    preparationStatus: {
      type: String,
      enum: ["pending", "preparing", "ready"],
      default: "pending",
    },
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
    },
    // --- Subscription / meal-change flow (additive; optional on all orders) ---
    /** When the meal is scheduled to arrive (used for 2h-before edit-window cron). */
    scheduledMealAt: {
      type: Date,
      default: null,
      index: true,
    },
    /** Snapshot of the primary meal item for subscription change / pricing. */
    selectedMeal: {
      itemId: { type: String, default: "" },
      name: { type: String, default: "" },
      price: { type: Number, default: 0 },
      quantity: { type: Number, default: 1 },
      image: { type: String, default: "" },
      isVeg: { type: Boolean, default: true },
    },
    /** Price at last confirmation / meal lock (for meal-change delta vs wallet). */
    basePrice: {
      type: Number,
      default: null,
    },
    /** Current meal line price after changes (null = derive from items/pricing for legacy). */
    finalPrice: {
      type: Number,
      default: null,
    },
    /** 30-minute window after 2h-before notification when user may change meal. */
    editWindow: {
      start: { type: Date, default: null },
      end: { type: Date, default: null },
    },
    /** Set once when 2h-before notification is sent (idempotent cron). */
    mealChangeNotificationSentAt: {
      type: Date,
      default: null,
    },
    /** Optimistic lock for subscription flow status transitions (duplicate update guard). */
    subscriptionFlowVersion: {
      type: Number,
      default: 0,
    },
    // ----------------------------------
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.razorpayOrderId": 1 });

// Generate order ID before saving (fallback if not provided)
orderSchema.pre("save", async function (next) {
  if (!this.orderId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.orderId = `ORD-${timestamp}-${random}`;
  }
  next();
});

// Update tracking when status changes
orderSchema.pre("save", function (next) {
  const now = new Date();

  if (this.isModified("status")) {
    switch (this.status) {
      case "confirmed":
        if (!this.tracking.confirmed.status) {
          this.tracking.confirmed = { status: true, timestamp: now };
        }
        break;
      case "preparing":
        if (!this.tracking.preparing.status) {
          this.tracking.preparing = { status: true, timestamp: now };
        }
        break;
      case "ready":
        if (!this.tracking.ready.status) {
          this.tracking.ready = { status: true, timestamp: now };
        }
        break;
      case "out_for_delivery":
        if (!this.tracking.outForDelivery.status) {
          this.tracking.outForDelivery = { status: true, timestamp: now };
        }
        break;
      case "delivered":
        if (!this.tracking.delivered.status) {
          this.tracking.delivered = { status: true, timestamp: now };
          this.deliveredAt = now;
        }
        break;
      case "cancelled":
        if (!this.cancelledAt) {
          this.cancelledAt = now;
        }
        break;
    }
  }

  next();
});

export default mongoose.model("Order", orderSchema);
