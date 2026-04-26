import Order from "../models/Order.js";
import UserSubscription from "../../subscription/models/UserSubscription.js";
import {
  addCalendarDaysFromYmd,
  mergeMealSlotRanges,
  parseTimeString,
  utcForWallClockMinute,
  wallClockFromUtc,
} from "../../subscription/services/subscriptionScheduleService.js";

const DEFAULT_MEAL_SLOT_TIMEZONE = "Asia/Kolkata";
const DEFAULT_MEAL_SLOT_TIMES = mergeMealSlotRanges(null);
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const EDIT_WINDOW_MS = 30 * 60 * 1000;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function minuteKey(subscriptionId, dateLike) {
  const ms = new Date(dateLike).getTime();
  if (!Number.isFinite(ms)) return null;
  return `${String(subscriptionId)}:${Math.floor(ms / 60000)}`;
}

function getMealCategoriesForSubscription(items) {
  return [
    ...new Set(
      (items || [])
        .map((item) => item?.mealCategory)
        .filter((mealCategory) =>
          ["breakfast", "lunch", "snacks", "dinner"].includes(mealCategory),
        ),
    ),
  ];
}

function getSubscriptionSlotInstantsWithinWindow({
  subscription,
  start,
  end,
  mealSlotTimezone = DEFAULT_MEAL_SLOT_TIMEZONE,
  mealSlotTimes = DEFAULT_MEAL_SLOT_TIMES,
}) {
  const categories = getMealCategoriesForSubscription(subscription?.items);
  if (!categories.length) return [];

  const slotRanges = mergeMealSlotRanges(mealSlotTimes);
  const startWall = wallClockFromUtc(start.getTime(), mealSlotTimezone);
  const endWall = wallClockFromUtc(end.getTime(), mealSlotTimezone);
  const slotInstants = [];

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const { y, mo, d } = addCalendarDaysFromYmd(
      startWall.y,
      startWall.mo,
      startWall.d,
      dayOffset,
      mealSlotTimezone,
    );

    for (const mealCategory of categories) {
      const parsed = parseTimeString(slotRanges?.[mealCategory]?.start);
      if (!parsed) continue;

      const slotUtcMs = utcForWallClockMinute(
        y,
        mo,
        d,
        parsed.h,
        parsed.m,
        mealSlotTimezone,
      );
      if (slotUtcMs == null) continue;

      const slotAt = new Date(slotUtcMs);
      if (slotAt < start || slotAt > end) continue;

      const slotWall = wallClockFromUtc(slotUtcMs, mealSlotTimezone);
      if (
        slotWall.y > endWall.y ||
        (slotWall.y === endWall.y && slotWall.mo > endWall.mo) ||
        (slotWall.y === endWall.y &&
          slotWall.mo === endWall.mo &&
          slotWall.d > endWall.d)
      ) {
        continue;
      }

      slotInstants.push({
        mealCategory,
        scheduledMealAt: slotAt,
      });
    }
  }

  slotInstants.sort(
    (a, b) => a.scheduledMealAt.getTime() - b.scheduledMealAt.getTime(),
  );
  return slotInstants;
}

function normalizeOrderItems(items) {
  return (items || []).map((item) => ({
    itemId: String(item?.itemId || item?.id || ""),
    name: String(item?.name || "Item"),
    price: Number(item?.price) || 0,
    quantity: Math.max(1, Number(item?.quantity) || 1),
    image: item?.image || "",
    description: item?.description || "",
    isVeg: item?.isVeg !== false,
    subCategory: item?.subCategory || "",
  }));
}

function computeSubtotal(items) {
  return items.reduce(
    (sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1),
    0,
  );
}

function buildSelectedMeal(items) {
  const first = items[0];
  if (!first) {
    return {
      itemId: "",
      name: "",
      price: 0,
      quantity: 1,
      image: "",
      isVeg: true,
    };
  }
  return {
    itemId: String(first.itemId || ""),
    name: String(first.name || ""),
    price: Number(first.price) || 0,
    quantity: Math.max(1, Number(first.quantity) || 1),
    image: first.image || "",
    isVeg: first.isVeg !== false,
  };
}

function buildDeterministicSubscriptionOrderId(subscriptionId, scheduledMealAt) {
  return `SUB-${String(subscriptionId).slice(-6).toUpperCase()}-${Math.floor(
    scheduledMealAt.getTime() / 60000,
  )}`;
}

function deriveSubscriptionOrderTimingState(scheduledMealAt, now = new Date()) {
  const scheduledMs = new Date(scheduledMealAt).getTime();
  const editStart = new Date(scheduledMs - TWENTY_FOUR_H_MS);
  const editEnd = new Date(editStart.getTime() + EDIT_WINDOW_MS);
  const nowMs = now.getTime();

  if (nowMs >= editEnd.getTime()) {
    return {
      status: "confirmed",
      mealChangeNotificationSentAt: editStart,
      editWindow: { start: editStart, end: editEnd },
    };
  }

  if (nowMs >= editStart.getTime()) {
    return {
      status: "scheduled",
      mealChangeNotificationSentAt: editStart,
      editWindow: { start: editStart, end: editEnd },
    };
  }

  return {
    status: "scheduled",
    mealChangeNotificationSentAt: null,
    editWindow: { start: null, end: null },
  };
}

function buildSubscriptionOrderPayload(subscription, scheduledMealAt, mealCategory, now) {
  const filteredItems = (subscription.items || []).filter(
    (item) => item?.mealCategory === mealCategory,
  );
  const items = normalizeOrderItems(filteredItems);
  if (!items.length) return null;

  const subtotal = computeSubtotal(items);
  const timing = deriveSubscriptionOrderTimingState(scheduledMealAt, now);
  const orderId = buildDeterministicSubscriptionOrderId(subscription._id, scheduledMealAt);

  return {
    orderId,
    userId: subscription.userId,
    restaurantId: String(subscription.restaurantId || ""),
    restaurantName: String(subscription.restaurantName || ""),
    items,
    address: subscription.address || {},
    deliveryAddress: subscription.address?.formattedAddress || "",
    phoneNumber: subscription.phoneNumber || "",
    pricing: {
      subtotal,
      deliveryFee: 0,
      platformFee: 0,
      tax: 0,
      discount: 0,
      total: subtotal,
      couponCode: null,
    },
    payment: {
      method: "wallet",
      status: "completed",
    },
    status: timing.status,
    preparationStatus: "pending",
    note: "",
    deliveryInstructions: "",
    specialCookingInstructions: subscription.specialCookingInstructions || "",
    source: {
      type: "subscription",
      subscriptionId: subscription._id,
    },
    sendCutlery: true,
    deliveryFleet: "standard",
    scheduledMealAt,
    selectedMeal: buildSelectedMeal(items),
    basePrice: subtotal,
    finalPrice: subtotal,
    editWindow: timing.editWindow,
    mealChangeNotificationSentAt: timing.mealChangeNotificationSentAt,
  };
}

async function fetchActiveSubscriptionsForWindow({
  restaurantId,
  restaurantName,
  start,
  end,
}) {
  const restaurantOr = [];
  if (restaurantId) {
    restaurantOr.push({ restaurantId: String(restaurantId) });
  }
  if (restaurantName) {
    restaurantOr.push({
      restaurantName: {
        $regex: `^${escapeRegex(restaurantName)}$`,
        $options: "i",
      },
    });
  }

  return UserSubscription.find({
    status: "active",
    $and: [
      ...(restaurantOr.length ? [{ $or: restaurantOr }] : []),
      { $or: [{ startDate: null }, { startDate: { $lte: end } }] },
      { $or: [{ pauseUntil: null }, { pauseUntil: { $lte: new Date() } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: start } }] },
    ],
  })
    .sort({ createdAt: 1, nextDeliveryAt: 1 })
    .lean();
}

export async function ensureSubscriptionOrdersExistForWindow({
  restaurantId,
  restaurantName,
  start,
  end,
  now = new Date(),
}) {
  const subscriptions = await fetchActiveSubscriptionsForWindow({
    restaurantId,
    restaurantName,
    start,
    end,
  });

  if (!subscriptions.length) {
    return { created: 0, subscriptionsChecked: 0, skippedExisting: 0 };
  }

  const candidates = [];
  for (const subscription of subscriptions) {
    const slotInstants = getSubscriptionSlotInstantsWithinWindow({
      subscription,
      start,
      end,
    });
    for (const slot of slotInstants) {
      const key = minuteKey(subscription._id, slot.scheduledMealAt);
      if (!key) continue;
      candidates.push({
        key,
        subscription,
        mealCategory: slot.mealCategory,
        scheduledMealAt: slot.scheduledMealAt,
      });
    }
  }

  if (!candidates.length) {
    return {
      created: 0,
      subscriptionsChecked: subscriptions.length,
      skippedExisting: 0,
    };
  }

  const existingOrders = await Order.find({
    "source.type": "subscription",
    "source.subscriptionId": {
      $in: [...new Set(candidates.map((candidate) => candidate.subscription._id))],
    },
    scheduledMealAt: { $gte: start, $lte: end },
  })
    .select("source.subscriptionId scheduledMealAt")
    .lean();

  const existingKeys = new Set(
    existingOrders
      .map((order) => minuteKey(order?.source?.subscriptionId, order?.scheduledMealAt))
      .filter(Boolean),
  );

  let created = 0;
  let skippedExisting = 0;

  for (const candidate of candidates) {
    if (existingKeys.has(candidate.key)) {
      skippedExisting++;
      continue;
    }

    const payload = buildSubscriptionOrderPayload(
      candidate.subscription,
      candidate.scheduledMealAt,
      candidate.mealCategory,
      now,
    );
    if (!payload) continue;

    try {
      await Order.create(payload);
      existingKeys.add(candidate.key);
      created++;
    } catch (error) {
      if (error?.code === 11000) {
        existingKeys.add(candidate.key);
        skippedExisting++;
        continue;
      }
      throw error;
    }
  }

  return {
    created,
    subscriptionsChecked: subscriptions.length,
    skippedExisting,
  };
}

export async function ensureUpcomingSubscriptionOrders({
  now = new Date(),
  horizonHours = 24 * 5,
} = {}) {
  const start = new Date(now);
  const end = new Date(now.getTime() + Number(horizonHours || 24) * 60 * 60 * 1000);

  return ensureSubscriptionOrdersExistForWindow({
    start,
    end,
    now,
  });
}
