import UserSubscription from "../../subscription/models/UserSubscription.js";
import UserPlanSubscription from "../../subscription/models/UserPlanSubscription.js";

function getPlanName(planDays) {
  const days = Number(planDays) || 0;
  if (days === 15) return "15 Days";
  if (days === 30) return "30 Days";
  if (days === 90) return "90 Days";
  return days > 0 ? `${days} Days` : "Subscription";
}

function getRemainingDays(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end - today) / (24 * 60 * 60 * 1000)));
}

function serializeUser(user) {
  if (!user || typeof user !== "object") {
    return { userName: "", userEmail: "", userPhone: "" };
  }
  return {
    userName: user.name || "",
    userEmail: user.email || user.googleEmail || "",
    userPhone: user.phone || "",
  };
}

function serializeMealSubscription(sub, planByUserId) {
  const userId = sub.userId?._id || sub.userId;
  const plan = planByUserId.get(String(userId));
  const effectiveEndDate = plan?.endDate || sub.endDate;
  const planDays = plan?.currentPlanDays || sub.planDays;

  return {
    _id: sub._id,
    userId,
    ...serializeUser(sub.userId),
    status: sub.status,
    planName: getPlanName(planDays),
    planDays,
    restaurantName: sub.restaurantName,
    deliverySlot: sub.deliverySlot,
    phoneNumber: sub.phoneNumber,
    address: sub.address,
    items: sub.items || [],
    specialCookingInstructions: sub.specialCookingInstructions || "",
    pausedAt: sub.pausedAt,
    pauseUntil: sub.pauseUntil,
    pauseType: sub.pauseType,
    itemsCount: Array.isArray(sub.items) ? sub.items.length : 0,
    remainingMeals:
      getRemainingDays(effectiveEndDate) != null
        ? getRemainingDays(effectiveEndDate) * Math.max(1, Array.isArray(sub.items) ? sub.items.length : 1)
        : null,
    remainingDays: getRemainingDays(effectiveEndDate),
    startDate: sub.startDate,
    endDate: effectiveEndDate,
    nextDeliveryAt: sub.nextDeliveryAt,
    autoPayEnabled: !!plan?.autoPayEnabled,
    queuedPlans: plan?.queuedPlans || [],
    source: "meal",
  };
}

function serializePlanSubscription(plan) {
  const userId = plan.userId?._id || plan.userId;
  return {
    _id: plan._id,
    userId,
    ...serializeUser(plan.userId),
    status: plan.status === "cancelled_renewal" ? "active" : plan.status,
    planName: getPlanName(plan.currentPlanDays),
    planDays: plan.currentPlanDays,
    restaurantName: "",
    deliverySlot: "",
    phoneNumber: "",
    address: null,
    items: [],
    specialCookingInstructions: "",
    pausedAt: null,
    pauseUntil: null,
    pauseType: null,
    itemsCount: 0,
    remainingMeals: null,
    remainingDays: getRemainingDays(plan.endDate),
    startDate: plan.firstPurchaseAt || plan.createdAt,
    endDate: plan.endDate,
    nextDeliveryAt: null,
    autoPayEnabled: !!plan.autoPayEnabled,
    queuedPlans: plan.queuedPlans || [],
    source: "plan",
  };
}

export const getActiveSubscriptions = async (req, res) => {
  try {
    const now = new Date();

    const [mealSubscriptions, planSubscriptions] = await Promise.all([
      UserSubscription.find({
        status: { $in: ["active", "paused"] },
        $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }],
      })
        .populate("userId", "name email googleEmail phone")
        .sort({ status: 1, nextDeliveryAt: 1, createdAt: -1 })
        .lean(),
      UserPlanSubscription.find({
        status: { $in: ["active", "cancelled_renewal"] },
        endDate: { $gte: now },
      })
        .populate("userId", "name email googleEmail phone")
        .sort({ endDate: 1, createdAt: -1 })
        .lean(),
    ]);

    const planByUserId = new Map(
      planSubscriptions.map((plan) => [String(plan.userId?._id || plan.userId), plan]),
    );
    const rows = mealSubscriptions.map((sub) => serializeMealSubscription(sub, planByUserId));

    const usersWithMealSubscription = new Set(rows.map((row) => String(row.userId)));
    for (const plan of planSubscriptions) {
      const userId = String(plan.userId?._id || plan.userId);
      if (!usersWithMealSubscription.has(userId)) {
        rows.push(serializePlanSubscription(plan));
      }
    }

    rows.sort((a, b) => {
      const aTime = a.nextDeliveryAt || a.endDate || a.startDate || 0;
      const bTime = b.nextDeliveryAt || b.endDate || b.startDate || 0;
      return new Date(aTime) - new Date(bTime);
    });

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching admin active subscriptions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active subscriptions",
    });
  }
};
