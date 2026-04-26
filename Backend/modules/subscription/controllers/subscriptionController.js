import UserSubscription from "../models/UserSubscription.js";
import UserPlanSubscription from "../models/UserPlanSubscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import SubscriptionPlanPurchase from "../models/SubscriptionPlanPurchase.js";
import SubscriptionSettings from "../models/SubscriptionSettings.js";
import {
  getNextMealDeliveryAt,
  getNextMealDeliveryAtWithinAccess,
} from "../services/subscriptionScheduleService.js";
import { categoryForNextDelivery } from "../services/subscriptionPauseService.js";
import {
  PAUSE_TYPES,
  computePauseCreditRupees,
  computePauseCreditCustomRange,
  computeDailyTotalWithDelivery,
  extendSubscriptionEndDate,
  resumeExpiredPauses,
  inclusiveLocalCalendarDaysBetween,
  pauseResumeInstantAfterRange,
  localYmdToday,
  remainingPlanDays,
  getSkipNextMealPreview,
} from "../services/subscriptionPauseService.js";
import { creditWallet } from "../../wallet/services/walletService.js";
import {
  createOrder as createRazorpayOrder,
  verifyPayment as verifyRazorpayPayment,
  fetchPayment as fetchRazorpayPayment,
  createRefund as createRazorpayRefund,
} from "../../payment/services/razorpayService.js";
import { getRazorpayCredentials } from "../../../shared/utils/envService.js";
import SubscriptionMealAddIntent from "../models/SubscriptionMealAddIntent.js";
import UserWallet from "../../user/models/UserWallet.js";

const MEAL_CATEGORY_KEYS = ["breakfast", "lunch", "snacks", "dinner"];
const MEAL_EDIT_LOCK_MESSAGE =
  "This meal is locked within 24 hours of delivery, but future meals can still be edited.";

function mealItemsHaveRequiredCategories(items) {
  return Array.isArray(items) && items.some((i) => i && (i.itemId || i.id));
}

function selectedMealsHaveRequiredCategories(selectedMeals, mealTypesEnabled = {}) {
  if (!Array.isArray(selectedMeals) || selectedMeals.length === 0) return false;
  for (const dayMeals of selectedMeals) {
    if (!dayMeals || typeof dayMeals !== "object") continue;
    for (const cat of MEAL_CATEGORY_KEYS) {
      if (mealTypesEnabled[cat] === false) continue;
      const arr = dayMeals[cat];
      if (Array.isArray(arr) && arr.length > 0) return true;
    }
  }
  return false;
}

async function userHasCompleteMealSelectionOnFile(userId) {
  const sub = await UserSubscription.findOne({
    userId,
    status: { $in: ["active", "paused"] },
  })
    .select("items")
    .lean();
  if (!sub?.items?.length) return false;
  return mealItemsHaveRequiredCategories(sub.items);
}

function categorySubtotalPaise(items, mealCategory) {
  let sum = 0;
  for (const i of items || []) {
    if (i.mealCategory !== mealCategory) continue;
    const p = Math.round((Number(i.price) || 0) * 100);
    const q = Number(i.quantity) || 1;
    sum += p * q;
  }
  return sum;
}

function totalItemsValuePaise(items) {
  let sum = 0;
  for (const i of items || []) {
    const p = Math.round((Number(i.price) || 0) * 100);
    const q = Number(i.quantity) || 1;
    sum += p * q;
  }
  return sum;
}

function normalizeSubscriptionItemFromBody(item) {
  return {
    itemId: item.itemId || item.id,
    name: item.name,
    price: Number(item.price),
    quantity: Number(item.quantity) || 1,
    image: item.image,
    isVeg: item.isVeg !== false,
    mealCategory: item.mealCategory || null,
  };
}

function mealEditLockPayload(sub) {
  return {
    canEditMeals: true,
    mealEditLockMessage: null,
    nextDeliveryAt: sub?.nextDeliveryAt || null,
    mealEditLockedUntil: null,
  };
}

/**
 * Mutates Mongoose sub document: supports multiple dishes per meal category.
 * Re-adding the same item updates its quantity instead of duplicating it.
 */
function applyAddItemToUserSubscriptionDoc(sub, newItem) {
  sub.items = sub.items || [];
  const existingIdx = sub.items.findIndex(
    (i) => String(i.itemId) === String(newItem.itemId) && i.mealCategory === newItem.mealCategory,
  );
  if (existingIdx >= 0) {
    sub.items[existingIdx].name = newItem.name;
    sub.items[existingIdx].price = newItem.price;
    sub.items[existingIdx].image = newItem.image;
    sub.items[existingIdx].isVeg = newItem.isVeg !== false;
    sub.items[existingIdx].quantity = Number(newItem.quantity) || 1;
  } else {
    sub.items.push(newItem);
  }
}

/** Upgrade delta in paise for a single item (0 if free, same, or downgrade). */
function computeMealAddAmountDuePaise(subItems, newItem) {
  const existing = (subItems || []).find(
    (i) => String(i.itemId) === String(newItem.itemId) && i.mealCategory === newItem.mealCategory,
  );
  const oldPaise =
    existing ? Math.round((Number(existing.price) || 0) * 100) * (Number(existing.quantity) || 1) : 0;
  const unitPaise = Math.round((Number(newItem.price) || 0) * 100);
  const qty = Number(newItem.quantity) || 1;
  const newPaise = unitPaise * qty;
  return Math.max(0, newPaise - oldPaise);
}

const DEFAULT_PLANS = [
  { durationDays: 15, name: "15 Days", price: null, priceType: "dynamic", active: true },
  { durationDays: 30, name: "30 Days", price: null, priceType: "dynamic", active: true },
  { durationDays: 90, name: "90 Days", price: null, priceType: "dynamic", active: true },
];

async function ensurePlansExist() {
  const count = await SubscriptionPlan.countDocuments();
  if (count === 0) {
    await SubscriptionPlan.insertMany(DEFAULT_PLANS);
  }
}

/**
 * Compute total price from selected meals (day-wise) + delivery charges.
 * selectedMeals: [{ day: 1, breakfast: [{itemId, name, price, quantity}], lunch: [...], snacks: [...], dinner: [...] }, ...]
 */
async function computePlanPrice(planDays, selectedMeals, plan = null) {
  const settings = await SubscriptionSettings.getSettings();
  const deliveryPerDay = Number(settings.deliveryChargesPerDay) || 30;

  let foodCost = 0;
  if (Array.isArray(selectedMeals) && selectedMeals.length > 0) {
    for (const dayMeals of selectedMeals) {
      for (const mealType of ["breakfast", "lunch", "snacks", "dinner"]) {
        const items = dayMeals[mealType];
        if (Array.isArray(items)) {
          for (const item of items) {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 1;
            foodCost += price * qty;
          }
        }
      }
    }
  }

  const deliveryCharges = deliveryPerDay * planDays;
  const totalPrice = foodCost + deliveryCharges;

  return {
    foodCost,
    deliveryCharges,
    totalPrice,
    deliveryChargesPerDay: deliveryPerDay,
    breakdown: {
      foodCost,
      deliveryCharges,
      totalPrice,
    },
  };
}

/**
 * POST /calculate-plan-price
 * Body: { planId or durationDays, selectedMeals: [{ day, breakfast, lunch, snacks, dinner }] }
 * Output: { totalPrice, breakdown: { foodCost, deliveryCharges, totalPrice } }
 */
export const calculatePlanPrice = async (req, res) => {
  try {
    const { planId, durationDays, selectedMeals } = req.body;
    const days = planId != null ? Number(planId) : (durationDays != null ? Number(durationDays) : null);
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(400).json({
        success: false,
        message: "planId or durationDays must be a positive integer (days)",
      });
    }

    const result = await computePlanPrice(days, selectedMeals || []);
    return res.status(200).json({
      success: true,
      data: {
        totalPrice: result.totalPrice,
        breakdown: result.breakdown,
        deliveryChargesPerDay: result.deliveryChargesPerDay,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getPlans = async (req, res) => {
  try {
    await ensurePlansExist();
    const plans = await SubscriptionPlan.find().sort({ durationDays: 1 }).lean();
    const data = plans.length ? plans : DEFAULT_PLANS;
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

function getPlanName(planDays) {
  const names = { 15: "15 Days", 30: "30 Days", 90: "90 Days" };
  return names[planDays] || `${planDays} Day(s)`;
}

/** Meal access end from DB or inferred from start + planDays (lean-safe). */
function inferMealSubscriptionAccessEnd(sub) {
  if (sub.endDate != null) return new Date(sub.endDate);
  const startMs =
    sub.startDate != null ? new Date(sub.startDate).getTime() : Number.NaN;
  if (!Number.isFinite(startMs) || !sub.planDays) return null;
  return new Date(startMs + Number(sub.planDays) * 24 * 60 * 60 * 1000);
}

function getRemainingDays(sub) {
  const end = inferMealSubscriptionAccessEnd(sub);
  if (!end || Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const diff = Math.ceil((endDay - today) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

function startOfDayLocal(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeCancellationRefundBreakdown(totalPaidPaise, startDate, endDate, now = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const totalPaid = Number(totalPaidPaise) || 0;
  if (!startDate || !endDate || totalPaid <= 0) {
    return {
      totalPlanDays: 0,
      usedPlanDays: 0,
      remainingPlanDays: 0,
      usedAmountPaise: 0,
      refundablePaise: 0,
    };
  }

  const start = startOfDayLocal(startDate);
  const end = startOfDayLocal(endDate);
  const today = startOfDayLocal(now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || Number.isNaN(today.getTime())) {
    return {
      totalPlanDays: 0,
      usedPlanDays: 0,
      remainingPlanDays: 0,
      usedAmountPaise: 0,
      refundablePaise: 0,
    };
  }

  const rawTotalDays = Math.ceil((end - start) / dayMs);
  const totalPlanDays = Math.max(1, rawTotalDays);
  const rawRemaining = Math.ceil((end - today) / dayMs);
  const remainingPlanDays = Math.min(totalPlanDays, Math.max(0, rawRemaining));
  const usedPlanDays = Math.max(0, totalPlanDays - remainingPlanDays);
  const usedAmountPaise = Math.min(totalPaid, Math.round((totalPaid * usedPlanDays) / totalPlanDays));
  const refundablePaise = Math.max(0, totalPaid - usedAmountPaise);

  return {
    totalPlanDays,
    usedPlanDays,
    remainingPlanDays,
    usedAmountPaise,
    refundablePaise,
  };
}

async function refundSubscriptionToOriginalSource({ userId, refundablePaise, purchases }) {
  let remainingPaise = Number(refundablePaise) || 0;
  const refundRecords = [];
  if (remainingPaise <= 0) {
    return { refundedPaise: 0, remainingPaise: 0, refundRecords };
  }

  const refundablePurchases = (purchases || [])
    .filter((p) => p?.razorpayPaymentId && Number(p.amount) > 0)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  for (const purchase of refundablePurchases) {
    if (remainingPaise <= 0) break;
    const purchaseAmount = Number(purchase.amount) || 0;
    const refundAmount = Math.min(remainingPaise, purchaseAmount);
    if (refundAmount <= 0) continue;
    const refund = await createRazorpayRefund(purchase.razorpayPaymentId, refundAmount, {
      userId: String(userId),
      source: "subscription_cancel",
      planDays: String(purchase.planDays || ""),
      purchaseId: String(purchase._id || ""),
    });
    refundRecords.push({
      purchaseId: purchase._id,
      razorpayPaymentId: purchase.razorpayPaymentId,
      razorpayRefundId: refund?.id,
      refundedPaise: refundAmount,
    });
    remainingPaise -= refundAmount;
  }

  return {
    refundedPaise: Math.max(0, (Number(refundablePaise) || 0) - remainingPaise),
    remainingPaise: Math.max(0, remainingPaise),
    refundRecords,
  };
}

/** Paid plan billing end (UserPlanSubscription), if user still has access through that record */
async function getUserPlanBillingEndDate(userId) {
  const ups = await UserPlanSubscription.findOne({ userId }).lean();
  if (!ups?.endDate) return null;
  const end = new Date(ups.endDate);
  if (ups.status === "active") {
    return end;
  }
  /* Renewals turned off but access continues until endDate */
  if (ups.status === "cancelled_renewal" && end.getTime() > Date.now()) {
    return end;
  }
  return null;
}

/**
 * Latest instant we may schedule a paid meal: min(billing end, meal sub end) so we never show
 * deliveries after billing lapses (or after meal sub end if shorter).
 */
function accessEndInstantForDeliveryScheduling(billingEnd, mealEnd) {
  if (!billingEnd && !mealEnd) return null;
  if (!billingEnd) return mealEnd;
  if (!mealEnd) return billingEnd;
  return new Date(Math.min(billingEnd.getTime(), mealEnd.getTime()));
}

/**
 * After plan payment (UserPlanSubscription updated), create or update UserSubscription so
 * meal delivery + pause/skip match the flow: Subscription → Edit meal → Pay plan.
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {number} purchasedPlanDays
 * @param {object} body - may include mealItems | items, deliverySlot, mealRestaurantId, mealRestaurantName, address, phoneNumber, specialCookingInstructions
 * @param {{ endDate?: Date } | null | undefined} upsFinal - UserPlanSubscription after payment
 */
async function syncMealSubscriptionAfterPlanPayment(userId, purchasedPlanDays, body, upsFinal) {
  const itemsRaw = body.mealItems ?? body.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    return;
  }

  const targetEnd = upsFinal?.endDate ? new Date(upsFinal.endDate) : null;
  if (!targetEnd || Number.isNaN(targetEnd.getTime())) {
    return;
  }

  const deliverySlot =
    body.mealSubscriptionDeliverySlot === "non_veg" || body.deliverySlot === "non_veg" ? "non_veg" : "veg";
  const restaurantId = String(body.mealRestaurantId || "ziggybites").trim() || "ziggybites";
  const restaurantName = String(body.mealRestaurantName || "Ziggybites").trim() || "Ziggybites";

  const mappedItems = itemsRaw.map((i) => {
    const p = Number(i.price);
    return {
      itemId: i.itemId || i.id,
      name: i.name,
      price: Number.isFinite(p) ? p : 0,
      quantity: Number(i.quantity) || 1,
      image: i.image,
      isVeg: i.isVeg !== false,
      mealCategory: i.mealCategory || null,
    };
  });

  const settings = await SubscriptionSettings.getSettings();
  const now = new Date();

  let sub = await UserSubscription.findOne({ userId, status: { $in: ["active", "paused"] } });

  if (!sub) {
    const nextDeliveryAt = getNextMealDeliveryAt(mappedItems, settings, now);
    const days = Number(purchasedPlanDays) || 30;
    await UserSubscription.create({
      userId,
      restaurantId,
      restaurantName,
      planDays: days,
      deliverySlot,
      items: mappedItems,
      specialCookingInstructions: String(body.specialCookingInstructions || "").trim(),
      nextDeliveryAt,
      startDate: now,
      endDate: targetEnd,
      address: body.address && typeof body.address === "object" ? body.address : {},
      phoneNumber: body.phoneNumber || "",
    });
    return;
  }

  sub.endDate = targetEnd;
  if (sub.status === "active") {
    sub.items = mappedItems;
    sub.deliverySlot = deliverySlot;
    sub.restaurantId = restaurantId;
    sub.restaurantName = restaurantName;
    sub.nextDeliveryAt = getNextMealDeliveryAt(mappedItems, settings, now);
    if (body.specialCookingInstructions != null) {
      sub.specialCookingInstructions = String(body.specialCookingInstructions || "").trim();
    }
    if (body.address && typeof body.address === "object") {
      sub.address = body.address;
    }
    if (body.phoneNumber != null) {
      sub.phoneNumber = body.phoneNumber;
    }
  }
  await sub.save();
}

export const getActiveSubscriptions = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await resumeExpiredPauses();
    const subscriptions = await UserSubscription.find({
      userId,
      status: { $in: ["active", "paused"] },
    })
      .sort({ status: 1, nextDeliveryAt: 1 })
      .lean();
    const settings = await SubscriptionSettings.getSettings();
    const billingEnd = await getUserPlanBillingEndDate(userId);

    const syncOps = [];
    for (const sub of subscriptions) {
      if (billingEnd) {
        const cur = sub.endDate ? new Date(sub.endDate).getTime() : 0;
        if (billingEnd.getTime() > cur) {
          syncOps.push(UserSubscription.updateOne({ _id: sub._id }, { $set: { endDate: billingEnd } }));
          sub.endDate = billingEnd;
        }
      }
    }
    if (syncOps.length) {
      await Promise.all(syncOps);
    }

    const mealCatLabels = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      snacks: "Evening snacks",
      dinner: "Dinner",
    };
    const data = [];
    for (const sub of subscriptions) {
      const mealEnd = inferMealSubscriptionAccessEnd(sub);
      const accessClamp = accessEndInstantForDeliveryScheduling(billingEnd, mealEnd);

      let nextDeliveryAt = sub.nextDeliveryAt;
      if (sub.status === "active" && accessClamp) {
        /* Always derive from schedule + access window so UI never shows a stale slot past paid-through */
        nextDeliveryAt = getNextMealDeliveryAtWithinAccess(
          sub.items || [],
          settings,
          new Date(),
          accessClamp,
        );
        const prevMs = sub.nextDeliveryAt ? new Date(sub.nextDeliveryAt).getTime() : null;
        const nextMs = nextDeliveryAt ? nextDeliveryAt.getTime() : null;
        if (prevMs !== nextMs) {
          UserSubscription.updateOne({ _id: sub._id }, { $set: { nextDeliveryAt } }).catch(() => {});
        }
      }

      /* Same calendar end as next-delivery clamp: min(billing, meal) when both exist */
      const subForRemain =
        accessClamp != null ? { ...sub, endDate: accessClamp } : { ...sub, endDate: sub.endDate };
      let nextMealCategory = null;
      const subForCategory = { ...sub, nextDeliveryAt };
      if (sub.status === "active" && nextDeliveryAt) {
        try {
          nextMealCategory = categoryForNextDelivery(subForCategory, settings);
        } catch {
          nextMealCategory = sub.items?.find((i) => i.mealCategory)?.mealCategory || "lunch";
        }
      }

      data.push({
        ...sub,
        endDate: subForRemain.endDate,
        nextDeliveryAt,
        ...mealEditLockPayload({ ...sub, nextDeliveryAt }),
        planName: getPlanName(sub.planDays),
        planTierDays: sub.planDays,
        remainingDays: getRemainingDays(subForRemain),
        nextMealCategory,
        nextMealCategoryLabel: nextMealCategory ? mealCatLabels[nextMealCategory] || nextMealCategory : null,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createSubscription = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const {
      restaurantId,
      restaurantName,
      planDays,
      deliverySlot,
      items,
      specialCookingInstructions,
      address,
      phoneNumber,
    } = req.body;

    if (!restaurantId || !restaurantName || !planDays || !deliverySlot || !items?.length) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: restaurantId, restaurantName, planDays, deliverySlot, items",
      });
    }
    if (!Number.isInteger(Number(planDays)) || Number(planDays) <= 0) {
      return res.status(400).json({ success: false, message: "planDays must be a positive number of days" });
    }

    const existingMeal = await UserSubscription.findOne({
      userId,
      status: { $in: ["active", "paused"] },
    }).lean();
    if (existingMeal) {
      return res.status(409).json({
        success: false,
        message:
          existingMeal.status === "paused"
            ? "You already have a paused meal subscription. Resume deliveries from Subscription, or contact support."
            : "You already have an active meal subscription.",
      });
    }

    const startDate = new Date();
    const subscriptionSettings = await SubscriptionSettings.getSettings();
    const mappedItems = items.map((i) => ({
      itemId: i.itemId || i.id,
      name: i.name,
      price: Number(i.price),
      quantity: Number(i.quantity) || 1,
      image: i.image,
      isVeg: i.isVeg !== false,
      mealCategory: i.mealCategory || null,
    }));
    const nextDeliveryAt = getNextMealDeliveryAt(mappedItems, subscriptionSettings, startDate);
    const days = Number(planDays);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const sub = await UserSubscription.create({
      userId,
      restaurantId: restaurantId || "",
      restaurantName,
      planDays: days,
      deliverySlot: deliverySlot === "non_veg" ? "non_veg" : "veg",
      items: mappedItems,
      specialCookingInstructions: specialCookingInstructions || "",
      nextDeliveryAt,
      startDate,
      endDate,
      address: address || {},
      phoneNumber: phoneNumber || "",
    });

    return res.status(201).json({
      success: true,
      data: sub,
      message: "Subscription created. You will get a notification 24 hours before each delivery.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Add or update items in a subscription (with meal category)
 * PATCH /subscription/:id/items
 * Body: { items: [{ itemId, name, price, quantity, image, isVeg, mealCategory }] }
 * Or body: { action: "add", item: {...} } | { action: "remove", itemId: "..." }
 */
export const updateSubscriptionItems = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { id } = req.params;
    const { items, action, item, itemId } = req.body;

    const sub = await UserSubscription.findOne({
      _id: id,
      userId,
      status: { $in: ["active", "paused"] },
    });
    if (!sub) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }
    if (action === "add" && item) {
      const newItem = normalizeSubscriptionItemFromBody(item);
      const duePaise = computeMealAddAmountDuePaise(sub.items, newItem);
      if (duePaise > 0) {
        return res.status(402).json({
          success: false,
          code: "SUBSCRIPTION_MEAL_PAYMENT_REQUIRED",
          message: "Pay from wallet and/or online to add or upgrade this meal.",
          data: { amountDueRupees: duePaise / 100 },
        });
      }
      applyAddItemToUserSubscriptionDoc(sub, newItem);
    } else if (action === "remove" && itemId) {
      const mealCat = req.body.mealCategory;
      sub.items = (sub.items || []).filter((i) => {
        if (String(i.itemId) !== String(itemId)) return true;
        if (mealCat != null) return i.mealCategory !== mealCat;
        return false;
      });
    } else if (Array.isArray(items) && items.length >= 0) {
      const mapped = items.map((i) => ({
        itemId: i.itemId || i.id,
        name: i.name,
        price: Number(i.price),
        quantity: Number(i.quantity) || 1,
        image: i.image,
        isVeg: i.isVeg !== false,
        mealCategory: i.mealCategory || null,
      }));
      const oldPaise = totalItemsValuePaise(sub.items);
      const newPaise = totalItemsValuePaise(mapped);
      if (newPaise > oldPaise) {
        return res.status(402).json({
          success: false,
          code: "SUBSCRIPTION_MEAL_PAYMENT_REQUIRED",
          message: "Payment required when increasing subscription meal value.",
          data: { amountDueRupees: (newPaise - oldPaise) / 100 },
        });
      }
      sub.items = mapped;
    } else {
      return res.status(400).json({ success: false, message: "Invalid request body" });
    }

    if (sub.items.length === 0) {
      return res.status(400).json({ success: false, message: "Subscription must have at least one item" });
    }

    const settings = await SubscriptionSettings.getSettings();
    const billingEnd = await getUserPlanBillingEndDate(userId);
    const mealEnd = sub.endDate ? new Date(sub.endDate) : null;
    const accessClamp = accessEndInstantForDeliveryScheduling(billingEnd, mealEnd);
    sub.nextDeliveryAt = accessClamp
      ? getNextMealDeliveryAtWithinAccess(sub.items || [], settings, new Date(), accessClamp)
      : getNextMealDeliveryAt(sub.items || [], settings, new Date());

    await sub.save();
    return res.status(200).json({
      success: true,
      data: sub,
      message: "Subscription items updated",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Start checkout for add/upgrade meal (wallet + Razorpay for remainder).
 * POST /subscription/:id/items/init-add-payment  Body: { item }
 */
export const initSubscriptionMealAddPayment = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { id } = req.params;
    const rawItem = req.body?.item;
    if (!rawItem) {
      return res.status(400).json({ success: false, message: "item is required" });
    }

    const sub = await UserSubscription.findOne({
      _id: id,
      userId,
      status: { $in: ["active", "paused"] },
    });
    if (!sub) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }
    const newItem = normalizeSubscriptionItemFromBody(rawItem);
    if (!newItem.mealCategory || !MEAL_CATEGORY_KEYS.includes(newItem.mealCategory)) {
      return res.status(400).json({ success: false, message: "Valid mealCategory is required" });
    }

    const amountDuePaise = computeMealAddAmountDuePaise(sub.items, newItem);

    if (amountDuePaise <= 0) {
      applyAddItemToUserSubscriptionDoc(sub, newItem);
      if (sub.items.length === 0) {
        return res.status(400).json({ success: false, message: "Subscription must have at least one item" });
      }
      const settings = await SubscriptionSettings.getSettings();
      sub.nextDeliveryAt = getNextMealDeliveryAt(sub.items || [], settings, new Date());
      await sub.save();
      return res.status(200).json({
        success: true,
        data: {
          paymentRequired: false,
          subscription: sub,
        },
      });
    }

    const wallet = await UserWallet.findOrCreateByUserId(userId);
    const walletPaise = Math.round((Number(wallet.balance) || 0) * 100);

    let walletApplyPaise = Math.min(walletPaise, amountDuePaise);
    let razorpayPaise = amountDuePaise - walletApplyPaise;

    if (razorpayPaise > 0 && razorpayPaise < 100) {
      razorpayPaise = 100;
      walletApplyPaise = Math.max(0, amountDuePaise - razorpayPaise);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    if (razorpayPaise <= 0) {
      let onlineOnlyPaise = amountDuePaise;
      if (onlineOnlyPaise > 0 && onlineOnlyPaise < 100) {
        onlineOnlyPaise = 100;
      }
      let onlineOrder = null;
      if (onlineOnlyPaise > 0) {
        try {
          onlineOrder = await createRazorpayOrder({
            amount: onlineOnlyPaise,
            currency: "INR",
            receipt: `sub_meal_online_${String(id).slice(-8)}_${Date.now()}`,
            notes: { subscriptionId: String(id), type: "meal_add_online_only" },
          });
        } catch (e) {
          console.warn("[initSubscriptionMealAddPayment] online-only Razorpay order failed:", e?.message);
        }
      }

      const intent = await SubscriptionMealAddIntent.create({
        userId,
        subscriptionId: sub._id,
        itemPayload: newItem,
        amountDuePaise,
        walletPlannedPaise: walletApplyPaise,
        razorpayAmountPaise: 0,
        razorpayOrderId: null,
        onlineOnlyRazorpayOrderId: onlineOrder?.id || null,
        onlineOnlyAmountPaise: onlineOrder ? onlineOnlyPaise : 0,
        status: "pending",
        expiresAt,
      });

      const credentials = await getRazorpayCredentials();
      const keyId = credentials?.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;

      return res.status(200).json({
        success: true,
        data: {
          paymentRequired: true,
          walletOnly: false,
          checkoutId: String(intent._id),
          amountDueRupees: amountDuePaise / 100,
          walletWillDebitRupees: walletApplyPaise / 100,
          payOnlineRupees: 0,
          razorpay: null,
          razorpayOnlineOnly:
            onlineOrder && keyId
              ? {
                  orderId: onlineOrder.id,
                  amount: onlineOrder.amount,
                  currency: onlineOrder.currency || "INR",
                  key: keyId,
                }
              : null,
        },
      });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amount: razorpayPaise,
        currency: "INR",
        receipt: `sub_meal_${String(id).slice(-8)}_${Date.now()}`,
        notes: { subscriptionId: String(id), type: "meal_add" },
      });
    } catch (e) {
      return res.status(503).json({
        success: false,
        message: e?.message || "Payment gateway unavailable. Try again later.",
      });
    }

    const intent = await SubscriptionMealAddIntent.create({
      userId,
      subscriptionId: sub._id,
      itemPayload: newItem,
      amountDuePaise,
      walletPlannedPaise: walletApplyPaise,
      razorpayAmountPaise: razorpayPaise,
      razorpayOrderId: razorpayOrder.id,
      status: "pending",
      expiresAt,
    });

    const credentials = await getRazorpayCredentials();
    const keyId = credentials?.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;

    return res.status(200).json({
      success: true,
      data: {
        paymentRequired: true,
        walletOnly: false,
        checkoutId: String(intent._id),
        amountDueRupees: amountDuePaise / 100,
        walletWillDebitRupees: walletApplyPaise / 100,
        payOnlineRupees: razorpayPaise / 100,
        razorpay: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency || "INR",
          key: keyId,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Complete meal add after wallet / Razorpay.
 * POST /subscription/:id/items/confirm-add-payment
 * Body: { checkoutId, razorpayOrderId?, razorpayPaymentId?, razorpaySignature? }
 */
export const confirmSubscriptionMealAddPayment = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { checkoutId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!checkoutId) {
      return res.status(400).json({ success: false, message: "checkoutId is required" });
    }

    const intent = await SubscriptionMealAddIntent.findOne({
      _id: checkoutId,
      userId,
    });
    if (!intent) {
      return res.status(404).json({ success: false, message: "Checkout not found" });
    }

    if (intent.status === "completed") {
      const existingSub = await UserSubscription.findById(intent.subscriptionId);
      return res.status(200).json({
        success: true,
        data: existingSub,
        message: "Already processed",
      });
    }

    if (intent.status !== "pending" || intent.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Checkout expired or invalid" });
    }

    const sub = await UserSubscription.findOne({ _id: intent.subscriptionId, userId });
    if (!sub) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }
    const hasSplitRz = Number(intent.razorpayAmountPaise) > 0 && intent.razorpayOrderId;
    const hasOnlineOnly =
      Number(intent.onlineOnlyAmountPaise) > 0 && intent.onlineOnlyRazorpayOrderId;

    let walletDebitRupee = 0;

    if (hasSplitRz) {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: "Razorpay payment details required for this checkout",
        });
      }
      if (String(razorpayOrderId) !== String(intent.razorpayOrderId)) {
        return res.status(400).json({ success: false, message: "Order mismatch" });
      }
      const ok = await verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!ok) {
        return res.status(400).json({ success: false, message: "Payment verification failed" });
      }
      let paidPaise = intent.razorpayAmountPaise;
      try {
        const payment = await fetchRazorpayPayment(razorpayPaymentId);
        paidPaise = Number(payment?.amount) || paidPaise;
      } catch {
        /* use intent amount */
      }
      if (paidPaise < intent.razorpayAmountPaise) {
        return res.status(400).json({ success: false, message: "Paid amount is insufficient" });
      }
      intent.razorpayPaymentId = razorpayPaymentId;
      walletDebitRupee = Number((intent.walletPlannedPaise / 100).toFixed(2));
    } else if (hasOnlineOnly) {
      const paysOnline = !!(razorpayOrderId && razorpayPaymentId && razorpaySignature);
      if (paysOnline) {
        if (String(razorpayOrderId) !== String(intent.onlineOnlyRazorpayOrderId)) {
          return res.status(400).json({ success: false, message: "Order mismatch" });
        }
        const ok = await verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!ok) {
          return res.status(400).json({ success: false, message: "Payment verification failed" });
        }
        let paidPaise = intent.onlineOnlyAmountPaise;
        try {
          const payment = await fetchRazorpayPayment(razorpayPaymentId);
          paidPaise = Number(payment?.amount) || paidPaise;
        } catch {
          /* use intent amount */
        }
        if (paidPaise < intent.onlineOnlyAmountPaise) {
          return res.status(400).json({ success: false, message: "Paid amount is insufficient" });
        }
        intent.razorpayPaymentId = razorpayPaymentId;
        walletDebitRupee = 0;
      } else {
        if (razorpayOrderId) {
          return res.status(400).json({
            success: false,
            message: "Incomplete Razorpay payment data",
          });
        }
        walletDebitRupee = Number((intent.walletPlannedPaise / 100).toFixed(2));
      }
    } else {
      if (razorpayOrderId) {
        return res.status(400).json({
          success: false,
          message: "Razorpay was not expected for this checkout",
        });
      }
      walletDebitRupee = Number((intent.walletPlannedPaise / 100).toFixed(2));
    }

    // walletDebitRupee set above for split + wallet paths; 0 for online-only Razorpay path
    if (walletDebitRupee > 0) {
      const updatedWallet = await UserWallet.deductAtomic(userId, walletDebitRupee, {
        description: `Subscription meal — ${intent.itemPayload?.mealCategory || "update"}`,
        reason: "order_payment",
      });
      if (!updatedWallet) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance. Please start checkout again.",
        });
      }
      const User = (await import("../../auth/models/User.js")).default;
      await User.findByIdAndUpdate(userId, {
        "wallet.balance": updatedWallet.balance,
        "wallet.currency": updatedWallet.currency,
      });
    }

    applyAddItemToUserSubscriptionDoc(sub, intent.itemPayload);
    if (sub.items.length === 0) {
      intent.status = "failed";
      await intent.save();
      return res.status(400).json({ success: false, message: "Invalid items after update" });
    }
    const settings = await SubscriptionSettings.getSettings();
    sub.nextDeliveryAt = getNextMealDeliveryAt(sub.items || [], settings, new Date());
    await sub.save();

    intent.status = "completed";
    await intent.save();

    return res.status(200).json({
      success: true,
      data: sub,
      message: "Meal updated",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Pause options: skip_next_meal (stay active, skip one slot + wallet credit), 1_day, 7_days, indefinite.
 * POST /subscription/pause  Body: { subscriptionId?, pauseType, pauseStartDate?, pauseEndDate? (YYYY-MM-DD for custom_range) }
 */
export const pauseMealSubscription = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { subscriptionId, pauseType: rawType, pauseStartDate, pauseEndDate } = req.body || {};
    const pauseType = Object.values(PAUSE_TYPES).includes(rawType) ? rawType : PAUSE_TYPES.INDEFINITE;

    await resumeExpiredPauses();
    const settings = await SubscriptionSettings.getSettings();
    const MS_DAY = 24 * 60 * 60 * 1000;

    const query = { userId, status: "active" };
    if (subscriptionId) {
      query._id = subscriptionId;
    }
    const sub = await UserSubscription.findOne(query);
    if (!sub) {
      return res.status(404).json({
        success: false,
        message: "No active meal subscription to pause",
      });
    }

    let customInclusiveDays = null;
    let customResumeInstant = null;
    if (pauseType === PAUSE_TYPES.CUSTOM_RANGE) {
      const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
      const todayYmd = localYmdToday(tz);
      if (!pauseStartDate || !pauseEndDate) {
        return res.status(400).json({
          success: false,
          message: "pauseStartDate and pauseEndDate (YYYY-MM-DD) are required for a date-range pause.",
        });
      }
      const inclusiveDays = inclusiveLocalCalendarDaysBetween(pauseStartDate, pauseEndDate, tz);
      if (inclusiveDays == null) {
        return res.status(400).json({
          success: false,
          message: "Invalid dates. Use YYYY-MM-DD and ensure the end date is on or after the start date.",
        });
      }
      if (inclusiveDays > 7) {
        return res.status(400).json({
          success: false,
          message: "You can skip at most 7 calendar days in one request.",
        });
      }
      if (pauseStartDate < todayYmd) {
        return res.status(400).json({
          success: false,
          message: "Pause start cannot be before today.",
        });
      }
      const remaining = remainingPlanDays(sub);
      if (remaining < 999 && inclusiveDays > remaining) {
        return res.status(400).json({
          success: false,
          message: `You can pause at most ${remaining} calendar day(s) left on your plan.`,
        });
      }
      const resumeInstant = pauseResumeInstantAfterRange(pauseEndDate, tz);
      const nowProbe = new Date();
      if (!resumeInstant || resumeInstant.getTime() <= nowProbe.getTime()) {
        return res.status(400).json({
          success: false,
          message: "Choose dates so deliveries can resume after your pause.",
        });
      }
      customInclusiveDays = inclusiveDays;
      customResumeInstant = resumeInstant;
    }

    let credit;
    let walletMeta = { subscriptionId: String(sub._id), pauseType };
    if (pauseType === PAUSE_TYPES.SKIP_NEXT_MEAL) {
      credit = computePauseCreditRupees(PAUSE_TYPES.SKIP_NEXT_MEAL, sub, settings);
    } else if (pauseType === PAUSE_TYPES.CUSTOM_RANGE) {
      credit = computePauseCreditCustomRange(pauseStartDate, pauseEndDate, sub, settings);
      walletMeta = {
        ...walletMeta,
        pauseStartDate,
        pauseEndDate,
        inclusiveDays: customInclusiveDays,
      };
    } else {
      credit = computePauseCreditRupees(pauseType, sub, settings);
    }

    let walletBalanceAfter = null;

    const creditIfAny = async (label) => {
      if (credit <= 0) return;
      const { wallet } = await creditWallet(userId, credit, {
        reason: "subscription_pause",
        description: label,
        metadata: walletMeta,
      });
      if (wallet) walletBalanceAfter = wallet.balance;
    };

    if (pauseType === PAUSE_TYPES.SKIP_NEXT_MEAL) {
      await creditIfAny(`Subscription skip next meal — ₹${credit} credited to wallet`);
      extendSubscriptionEndDate(sub, 1);
      const after = new Date(sub.nextDeliveryAt || Date.now());
      after.setTime(after.getTime() + 60_000);
      sub.nextDeliveryAt = getNextMealDeliveryAt(sub.items || [], settings, after);
      sub.pausedAt = null;
      sub.pauseUntil = null;
      sub.pauseType = null;
      await sub.save();
      const data = sub.toObject();
      return res.status(200).json({
        success: true,
        data: {
          ...data,
          planName: getPlanName(sub.planDays),
          remainingDays: getRemainingDays(sub),
        },
        walletCredit: credit,
        walletBalanceAfter,
        message:
          credit > 0
            ? `Next meal skipped. ₹${credit} added to your wallet. Plan extended by 1 day.`
            : "Next meal skipped. Plan extended by 1 day.",
      });
    }

    const now = new Date();
    if (pauseType === PAUSE_TYPES.CUSTOM_RANGE) {
      extendSubscriptionEndDate(sub, customInclusiveDays);
      sub.pauseUntil = customResumeInstant;
      await creditIfAny(
        `Subscription pause ${customInclusiveDays} day(s) (${pauseStartDate}–${pauseEndDate}) — ₹${credit} credited to wallet`,
      );
    } else if (pauseType === PAUSE_TYPES.ONE_DAY) {
      extendSubscriptionEndDate(sub, 1);
      sub.pauseUntil = new Date(now.getTime() + MS_DAY);
      await creditIfAny(`Subscription pause 1 day — ₹${credit} credited to wallet`);
    } else if (pauseType === PAUSE_TYPES.SEVEN_DAYS) {
      extendSubscriptionEndDate(sub, 7);
      sub.pauseUntil = new Date(now.getTime() + 7 * MS_DAY);
      await creditIfAny(`Subscription pause 7 days — ₹${credit} credited to wallet`);
    } else {
      sub.pauseUntil = null;
      await creditIfAny(`Subscription paused — wallet credit ₹${credit}`);
    }

    sub.status = "paused";
    sub.pausedAt = now;
    sub.pauseType = pauseType;
    await sub.save();

    const data = sub.toObject();
    let msg = "Deliveries paused.";
    if (pauseType === PAUSE_TYPES.CUSTOM_RANGE) {
      msg = `Paused from ${pauseStartDate} through ${pauseEndDate} (${customInclusiveDays} day(s)). ₹${credit} credited to wallet. Plan extended by ${customInclusiveDays} day(s). Deliveries resume automatically.`;
    } else if (pauseType === PAUSE_TYPES.ONE_DAY) {
      msg = `Paused for 1 day. ₹${credit} credited to wallet. Plan end date extended by 1 day. Deliveries resume automatically.`;
    } else if (pauseType === PAUSE_TYPES.SEVEN_DAYS) {
      msg = `Paused for 7 days. ₹${credit} credited to wallet. Plan end date extended by 7 days. Deliveries resume automatically.`;
    } else if (pauseType === PAUSE_TYPES.INDEFINITE) {
      msg = "Deliveries paused until you resume. No wallet credit for open-ended pause.";
    }
    return res.status(200).json({
      success: true,
      data: {
        ...data,
        planName: getPlanName(sub.planDays),
        remainingDays: getRemainingDays(sub),
      },
      walletCredit: credit,
      walletBalanceAfter,
      pauseUntil: sub.pauseUntil,
      message: msg,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /subscription/pause-estimate?pauseType=...&subscriptionId=...
 */
export const getPauseEstimate = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const pauseTypeRaw = req.query.pauseType;
    const pauseType = Object.values(PAUSE_TYPES).includes(pauseTypeRaw) ? pauseTypeRaw : PAUSE_TYPES.INDEFINITE;
    const subscriptionId = req.query.subscriptionId;
    const estStart = req.query.pauseStartDate;
    const estEnd = req.query.pauseEndDate;
    await resumeExpiredPauses();
    const settings = await SubscriptionSettings.getSettings();
    const q = { userId, status: "active" };
    if (subscriptionId) q._id = subscriptionId;
    const doc = await UserSubscription.findOne(q);
    if (!doc) {
      return res.status(404).json({ success: false, message: "No active meal subscription" });
    }
    const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
    let credit;
    let inclusiveDays = null;
    if (pauseType === PAUSE_TYPES.CUSTOM_RANGE) {
      if (!estStart || !estEnd) {
        return res.status(400).json({
          success: false,
          message: "pauseStartDate and pauseEndDate query params are required for custom_range estimate",
        });
      }
      inclusiveDays = inclusiveLocalCalendarDaysBetween(estStart, estEnd, tz);
      if (inclusiveDays != null && inclusiveDays > 7) {
        return res.status(400).json({
          success: false,
          message: "You can estimate at most 7 calendar days per request.",
        });
      }
      credit =
        inclusiveDays != null
          ? computePauseCreditCustomRange(estStart, estEnd, doc, settings)
          : 0;
    } else {
      credit = computePauseCreditRupees(pauseType, doc, settings);
    }
    const dailyTotal = computeDailyTotalWithDelivery(doc.items, settings.deliveryChargesPerDay);
    const skipNextPreview =
      pauseType === PAUSE_TYPES.SKIP_NEXT_MEAL ? getSkipNextMealPreview(doc, settings) : null;
    return res.status(200).json({
      success: true,
      data: {
        pauseType,
        estimatedWalletCredit: credit,
        dailyTotalApprox: dailyTotal,
        deliveryPerDay: settings.deliveryChargesPerDay ?? 30,
        inclusiveDays,
        mealSlotTimezone: tz,
        skipNextPreview,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Resume meal deliveries; next delivery is recomputed from admin meal slots.
 * POST /subscription/resume  Body: { subscriptionId?: string }
 */
export const resumeMealSubscription = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { subscriptionId } = req.body || {};
    const query = { userId, status: "paused" };
    if (subscriptionId) {
      query._id = subscriptionId;
    }
    const sub = await UserSubscription.findOne(query);
    if (!sub) {
      return res.status(404).json({
        success: false,
        message: "No paused meal subscription to resume",
      });
    }
    const settings = await SubscriptionSettings.getSettings();
    const now = new Date();
    sub.status = "active";
    sub.pausedAt = null;
    sub.pauseUntil = null;
    sub.pauseType = null;
    sub.nextDeliveryAt = getNextMealDeliveryAt(sub.items || [], settings, now);
    await sub.save();
    const lean = sub.toObject();
    return res.status(200).json({
      success: true,
      data: {
        ...lean,
        planName: getPlanName(sub.planDays),
        remainingDays: getRemainingDays(sub),
      },
      message: "Deliveries resumed. Your next meal slot has been scheduled.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Create Razorpay order for subscription plan purchase.
 * For dynamic plans: requires selectedMeals; amount computed from food + delivery.
 * For fixed plans: uses plan.price (backward compatibility).
 */
export const createPlanOrder = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { planDays, selectedMeals } = req.body;
    const duration = planDays != null ? Number(planDays) : null;
    if (!Number.isInteger(duration) || duration <= 0) {
      return res.status(400).json({ success: false, message: "planDays must be a positive number of days" });
    }

    await ensurePlansExist();
    const plan = await SubscriptionPlan.findOne({ durationDays: duration, active: true }).lean();
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found or inactive" });
    }

    const mealTypesEnabled = plan.mealTypesEnabled || {};
    const hasMealsOnSubscription = await userHasCompleteMealSelectionOnFile(userId);
    const mealsFromPayload = selectedMealsHaveRequiredCategories(selectedMeals, mealTypesEnabled);
    if (!hasMealsOnSubscription && !mealsFromPayload) {
      return res.status(400).json({
        success: false,
        message: "Add at least one meal item before purchasing a plan.",
      });
    }

    let amountRupees = 0;
    const priceType = plan.priceType || (plan.price > 0 ? "fixed" : "dynamic");

    if (priceType === "fixed" && plan.price != null && plan.price > 0) {
      amountRupees = plan.price;
    } else {
      const computed = await computePlanPrice(duration, selectedMeals || [], plan);
      amountRupees = computed.totalPrice;
      if (amountRupees <= 0) {
        return res.status(400).json({
          success: false,
          message: "Select at least one meal for each day to proceed. Price is computed from your selections.",
        });
      }
    }

    const amountPaise = Math.round(amountRupees * 100);
    if (amountPaise < 100) {
      return res.status(400).json({ success: false, message: "Invalid plan price" });
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: amountPaise,
      currency: "INR",
      receipt: `sub_plan_${duration}_${Date.now()}`,
      notes: { planDays: String(duration) },
    });

    const credentials = await getRazorpayCredentials();
    const keyId = credentials?.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;

    return res.status(200).json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || "INR",
        key: keyId,
        planDays: duration,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Verify Razorpay payment for plan purchase and create SubscriptionPlanPurchase.
 * For dynamic plans: amount comes from Razorpay order (already computed at create-plan-order).
 */
export const verifyPlanPayment = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, planDays, autoPayEnabled } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing razorpayOrderId, razorpayPaymentId, or razorpaySignature",
      });
    }

    const duration = planDays != null ? Number(planDays) : null;
    if (!Number.isInteger(duration) || duration <= 0) {
      return res.status(400).json({ success: false, message: "planDays must be a positive number of days" });
    }

    const planForMeals = await SubscriptionPlan.findOne({ durationDays: duration }).lean();
    if (planForMeals) {
      const hasOnFile = await userHasCompleteMealSelectionOnFile(userId);
      const fromBody = mealItemsHaveRequiredCategories(req.body.mealItems);
      if (!fromBody && !hasOnFile) {
        return res.status(400).json({
          success: false,
          message: "Meal selection is incomplete. Add at least one meal item before purchasing.",
        });
      }
    }

    const isValid = await verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    const plan = await SubscriptionPlan.findOne({ durationDays: duration }).lean();
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Amount from Razorpay payment (already paid)
    let amountPaise = 0;
    try {
      const payment = await fetchRazorpayPayment(razorpayPaymentId);
      amountPaise = payment?.amount || 0;
    } catch {
      amountPaise = Math.round((plan.price || 0) * 100);
    }
    const existing = await SubscriptionPlanPurchase.findOne({
      userId,
      razorpayOrderId,
    });
    if (existing) {
      const upsFinalEarly = await UserPlanSubscription.findOne({ userId }).lean();
      try {
        await syncMealSubscriptionAfterPlanPayment(userId, duration, req.body, upsFinalEarly);
      } catch (syncErr) {
        console.error("syncMealSubscriptionAfterPlanPayment", syncErr);
      }
      return res.status(200).json({
        success: true,
        data: existing,
        message: "Plan already purchased",
      });
    }

    const purchase = await SubscriptionPlanPurchase.create({
      userId,
      planDays: duration,
      amount: amountPaise,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      status: "paid",
    });

    // Handle UserPlanSubscription: advance recharge, extension, upgrade (queuing)
    const today = new Date();
    const firstPurchase = await SubscriptionPlanPurchase.findOne({ userId }).sort({ createdAt: 1 });
    const firstPurchaseAt = firstPurchase?.createdAt || today;

    let ups = await UserPlanSubscription.findOne({ userId });
    if (!ups || ups.endDate <= today) {
      // New or expired: create/restart with new endDate
      const newEndDate = new Date(today);
      newEndDate.setDate(newEndDate.getDate() + duration);
      await UserPlanSubscription.findOneAndUpdate(
        { userId },
        {
          $set: {
            endDate: newEndDate,
            currentPlanDays: duration,
            autoPayEnabled: !!autoPayEnabled,
            firstPurchaseAt,
            status: "active",
            cancellationRequestedAt: null,
          },
          $setOnInsert: { queuedPlans: [] },
        },
        { upsert: true, new: true }
      );
    } else {
      // Active: extension or upgrade
      const currentDays = ups.currentPlanDays || duration;
      if (duration > currentDays) {
        // Upgrade: queue the new plan (activates when current ends)
        await UserPlanSubscription.updateOne(
          { userId },
          {
            $push: { queuedPlans: { planDays: duration, purchasedAt: today, status: "queued" } },
            $set: { autoPayEnabled: !!autoPayEnabled },
          }
        );
      } else {
        // Extension: add days to endDate
        const newEndDate = new Date(ups.endDate);
        newEndDate.setDate(newEndDate.getDate() + duration);
        await UserPlanSubscription.updateOne(
          { userId },
          {
            $set: {
              endDate: newEndDate,
              currentPlanDays: duration,
              autoPayEnabled: !!autoPayEnabled,
            },
          }
        );
      }
    }

    const upsFinal = await UserPlanSubscription.findOne({ userId }).lean();
    try {
      await syncMealSubscriptionAfterPlanPayment(userId, duration, req.body, upsFinal);
    } catch (syncErr) {
      console.error("syncMealSubscriptionAfterPlanPayment", syncErr);
    }

    return res.status(201).json({
      success: true,
      data: purchase,
      message: "Plan purchased successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get list of plan durations the user has purchased
 */
export const getPurchasedPlans = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const purchases = await SubscriptionPlanPurchase.find({ userId, status: "paid" })
      .sort({ createdAt: -1 })
      .lean();
    const data = purchases.map((p) => ({
      planDays: p.planDays,
      purchasedAt: p.createdAt,
    }));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get plan dashboard: active plan, queued plans, autoPay, 7-day cancel eligibility
 */
export const getPlanDashboard = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const ups = await UserPlanSubscription.findOne({ userId }).lean();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upsEnd = ups?.endDate ? new Date(ups.endDate) : null;
    const hasVisiblePlan =
      ups &&
      upsEnd &&
      !Number.isNaN(upsEnd.getTime()) &&
      (ups.status === "active" ||
        (ups.status === "cancelled_renewal" && upsEnd.getTime() > Date.now()));

    if (!hasVisiblePlan) {
      return res.status(200).json({
        success: true,
        data: {
          activePlan: null,
          remainingDays: 0,
          endDate: null,
          autoPayEnabled: false,
          queuedPlans: [],
          canCancelIn7Days: false,
          cancellationRequestedAt: null,
        },
      });
    }

    const endDay = new Date(ups.endDate);
    endDay.setHours(0, 0, 0, 0);
    const remainingDays = Math.max(0, Math.ceil((endDay - today) / (24 * 60 * 60 * 1000)));
    const firstPurchaseAt = ups.firstPurchaseAt ? new Date(ups.firstPurchaseAt) : null;
    const daysSinceFirst = firstPurchaseAt
      ? Math.floor((today - firstPurchaseAt) / (24 * 60 * 60 * 1000))
      : 999;
    const canCancelIn7Days = daysSinceFirst <= 7 && !ups.cancellationRequestedAt;

    return res.status(200).json({
      success: true,
      data: {
        activePlan: {
          planDays: ups.currentPlanDays,
          endDate: ups.endDate,
        },
        remainingDays,
        endDate: ups.endDate,
        autoPayEnabled: !!ups.autoPayEnabled,
        queuedPlans: (ups.queuedPlans || []).filter((q) => q.status === "queued"),
        canCancelIn7Days,
        cancellationRequestedAt: ups.cancellationRequestedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Toggle auto-pay on/off
 */
export const toggleAutoPay = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { enabled } = req.body;
    const ups = await UserPlanSubscription.findOneAndUpdate(
      { userId },
      { $set: { autoPayEnabled: !!enabled } },
      { new: true }
    );
    if (!ups) {
      return res.status(404).json({ success: false, message: "No active plan subscription found" });
    }
    return res.status(200).json({
      success: true,
      data: { autoPayEnabled: !!ups.autoPayEnabled },
      message: ups.autoPayEnabled ? "Auto-pay enabled" : "Auto-pay disabled",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Cancel subscription with prorated deduction:
 * - amount for consumed plan days is deducted
 * - remaining amount is refunded to original payment source (Razorpay)
 * - supports preview via { previewOnly: true }
 */
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const previewOnly = !!req.body?.previewOnly;
    const ups = await UserPlanSubscription.findOne({ userId });
    if (!ups || ups.status !== "active") {
      return res.status(404).json({ success: false, message: "No active plan subscription found" });
    }
    const today = new Date();
    const purchases = await SubscriptionPlanPurchase.find({ userId, status: "paid" })
      .sort({ createdAt: 1 })
      .select("amount createdAt razorpayPaymentId planDays")
      .lean();
    const totalPaidPaise = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const firstPurchaseAt = ups.firstPurchaseAt ? new Date(ups.firstPurchaseAt) : null;
    const usageStart = firstPurchaseAt || purchases[0]?.createdAt || ups.createdAt || today;
    const usageEnd = ups.endDate || today;
    const calc = computeCancellationRefundBreakdown(totalPaidPaise, usageStart, usageEnd, today);
    const previewData = {
      totalPaid: Number((totalPaidPaise / 100).toFixed(2)),
      usedAmount: Number((calc.usedAmountPaise / 100).toFixed(2)),
      refundableAmount: Number((calc.refundablePaise / 100).toFixed(2)),
      totalPlanDays: calc.totalPlanDays,
      usedPlanDays: calc.usedPlanDays,
      remainingPlanDays: calc.remainingPlanDays,
      refundDestination: "original_payment_method",
    };

    if (previewOnly) {
      return res.status(200).json({
        success: true,
        message: "Cancellation preview calculated.",
        data: previewData,
      });
    }

    let refundedPaise = 0;
    let refundRecords = [];
    if (calc.refundablePaise > 0) {
      const refundResult = await refundSubscriptionToOriginalSource({
        userId,
        refundablePaise: calc.refundablePaise,
        purchases,
      });
      refundedPaise = refundResult.refundedPaise;
      refundRecords = refundResult.refundRecords;
      if (refundResult.remainingPaise > 0) {
        return res.status(400).json({
          success: false,
          message:
            "We could not process full refund to the original payment method automatically. Please contact support.",
          data: {
            ...previewData,
            refundedAmount: Number((refundedPaise / 100).toFixed(2)),
            pendingRefundAmount: Number((refundResult.remainingPaise / 100).toFixed(2)),
          },
        });
      }
    }

    await UserPlanSubscription.updateOne(
      { userId },
      {
        $set: {
          status: "cancelled",
          cancellationRequestedAt: today,
          autoPayEnabled: false,
          endDate: today,
          queuedPlans: [],
        },
      }
    );
    await UserSubscription.updateMany(
      { userId, status: { $in: ["active", "paused"] } },
      {
        $set: {
          status: "cancelled",
          pausedAt: null,
          pauseUntil: null,
          pauseType: null,
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: `Subscription cancelled. Refunded Rs. ${Number((refundedPaise / 100).toFixed(2)).toLocaleString("en-IN")} to your payment source.`,
      data: {
        ...previewData,
        refundedAmount: Number((refundedPaise / 100).toFixed(2)),
        refundDestination: "original_payment_method",
        refundTransactions: refundRecords,
        cancelledAt: today,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Set auto-pay mandate after first purchase (post-payment prompt)
 */
export const setAutoPayMandate = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { enabled } = req.body;
    const ups = await UserPlanSubscription.findOneAndUpdate(
      { userId },
      { $set: { autoPayEnabled: !!enabled } },
      { new: true }
    );
    if (!ups) {
      return res.status(404).json({ success: false, message: "No active plan subscription found" });
    }
    return res.status(200).json({
      success: true,
      data: { autoPayEnabled: !!ups.autoPayEnabled },
      message: ups.autoPayEnabled ? "Auto-pay enabled for future renewals" : "Auto-pay declined",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
