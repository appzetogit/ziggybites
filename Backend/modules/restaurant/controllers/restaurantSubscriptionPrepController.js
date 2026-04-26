import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Order from "../../order/models/Order.js";
import { ensureSubscriptionOrdersExistForWindow } from "../../order/services/subscriptionOrderGenerationService.js";

const SUBSCRIPTION_READY_BEFORE_MINUTES = 45;
const SUBSCRIPTION_READY_AFTER_MINUTES = 25;

function getReadyWindowForMeal(dateLike) {
  const scheduledAt = new Date(dateLike);
  if (Number.isNaN(scheduledAt.getTime())) return null;
  const startsAt = new Date(
    scheduledAt.getTime() - SUBSCRIPTION_READY_BEFORE_MINUTES * 60 * 1000,
  );
  const endsAt = new Date(
    scheduledAt.getTime() + SUBSCRIPTION_READY_AFTER_MINUTES * 60 * 1000,
  );
  const nowMs = Date.now();
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    canMarkReady: nowMs >= startsAt.getTime() && nowMs <= endsAt.getTime(),
    beforeMinutes: SUBSCRIPTION_READY_BEFORE_MINUTES,
    afterMinutes: SUBSCRIPTION_READY_AFTER_MINUTES,
  };
}

function mealCategoryForTime(dateLike) {
  const d = new Date(dateLike);
  const h = d.getHours();
  if (h >= 5 && h <= 10) return "breakfast";
  if (h >= 11 && h <= 15) return "lunch";
  if (h >= 16 && h <= 18) return "snacks";
  return "dinner";
}

function buildPrepSummaryAndRowsFromOrders(orders) {
  const prepSummary = {};
  const rows = orders.map((order) => {
    const { visible, reason, editWindowEndsAt, message } =
      canRestaurantSeeSubscriptionMealDetails(order);

    const base = {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      preparationStatus: order.preparationStatus,
      user:
        order.userId && typeof order.userId === "object"
          ? {
              _id: order.userId._id,
              name: order.userId.name,
              phone: order.userId.phone,
            }
          : null,
      scheduledMealAt: order.scheduledMealAt,
      readyWindow: getReadyWindowForMeal(order.scheduledMealAt),
      editWindow: order.editWindow,
      mealDetailsVisible: visible,
      visibilityReason: reason,
      userMessage: message,
      deliveryAddress:
        order.deliveryAddress || order.address?.formattedAddress || "",
      totalAmount: order.pricing?.total ?? null,
    };

    if (!visible) {
      return {
        ...base,
        items: [],
        selectedMeal: null,
        hint:
          editWindowEndsAt != null
            ? `Unlocks after ${new Date(editWindowEndsAt).toLocaleString()}`
            : "Waiting for customer meal-change window to finish.",
      };
    }

    const items = order.items || [];
    for (const it of items) {
      const name = it.name || "Item";
      const q = Number(it.quantity) || 1;
      prepSummary[name] = (prepSummary[name] || 0) + q;
    }

    return {
      ...base,
      items,
      selectedMeal: order.selectedMeal || null,
      pricing: order.pricing,
    };
  });

  return { prepSummary, rows };
}

/**
 * Restaurant may see exact dishes only after the customer's meal-change edit window ends,
 * so preparation matches the final locked order.
 */
export function canRestaurantSeeSubscriptionMealDetails(order) {
  if (order.source?.type !== "subscription") {
    return { visible: true, reason: "not_subscription" };
  }
  const end = order.editWindow?.end ? new Date(order.editWindow.end) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const visible = Date.now() > end.getTime();
    return {
      visible,
      reason: visible ? "edit_window_closed" : "edit_window_open",
      editWindowEndsAt: order.editWindow.end,
    };
  }
  // Subscription order but no editWindow yet (before 2h cron) — do not show dishes
  if (!order.mealChangeNotificationSentAt) {
    return {
      visible: false,
      reason: "awaiting_edit_window",
      message:
        "Meal details appear after the customer's change-meal window has ended.",
    };
  }
  // Notified but missing end (edge case) — stay hidden until window exists
  return {
    visible: false,
    reason: "edit_window_pending",
    message:
      "Meal details will unlock after the customer's 30-minute change window ends.",
  };
}

/**
 * GET /api/restaurant/subscription-prep/today
 * Today's subscription orders for this outlet + prep summary (meals only when unlocked).
 */
export const getTodaySubscriptionPrep = asyncHandler(async (req, res) => {
  const restaurant = req.restaurant;
  if (!restaurant?._id) {
    return errorResponse(res, 401, "Restaurant not found");
  }

  const restaurantId = String(restaurant._id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  await ensureSubscriptionOrdersExistForWindow({
    restaurantId,
    restaurantName: restaurant.name || "",
    start,
    end,
  });

  const orders = await Order.find({
    restaurantId,
    "source.type": "subscription",
    scheduledMealAt: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "skipped"] },
  })
    .sort({ scheduledMealAt: 1, createdAt: 1 })
    .populate("userId", "name phone")
    .lean();

  const { prepSummary, rows } = buildPrepSummaryAndRowsFromOrders(orders);

  return successResponse(res, 200, "Today's subscription preparation", {
    date: start.toISOString().slice(0, 10),
    orderCount: rows.length,
    mealDetailsUnlockedCount: rows.filter((r) => r.mealDetailsVisible).length,
    prepSummary,
    orders: rows,
  });
});

/**
 * GET /api/restaurant/subscription-prep/next-24h
 * Subscription orders scheduled in the next 24 hours for this outlet + prep summary (meals only when unlocked).
 */
export const getNext24hSubscriptionPrep = asyncHandler(async (req, res) => {
  const restaurant = req.restaurant;
  if (!restaurant?._id) {
    return errorResponse(res, 401, "Restaurant not found");
  }

  const restaurantId = String(restaurant._id);
  const restaurantName = restaurant.name || "";
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  await ensureSubscriptionOrdersExistForWindow({
    restaurantId,
    restaurantName,
    start,
    end,
  });

  const orders = await Order.find({
    restaurantId,
    "source.type": "subscription",
    scheduledMealAt: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "skipped"] },
  })
    .sort({ scheduledMealAt: 1, createdAt: 1 })
    .populate("userId", "name phone")
    .lean();

  const { prepSummary, rows } = buildPrepSummaryAndRowsFromOrders(orders);

  return successResponse(res, 200, "Next 24 hours subscription preparation", {
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    orderCount: rows.length,
    mealDetailsUnlockedCount: rows.filter((r) => r.mealDetailsVisible).length,
    prepSummary,
    orders: rows,
  });
});
