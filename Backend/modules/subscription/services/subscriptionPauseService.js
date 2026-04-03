import UserSubscription from "../models/UserSubscription.js";
import SubscriptionSettings from "../models/SubscriptionSettings.js";
import {
  getNextMealDeliveryAt,
  mergeMealSlotRanges,
  wallClockFromUtc,
  parseTimeString,
  getMealCategoriesFromItems,
  utcForWallClockMinute,
  addCalendarDaysFromYmd,
  getDeliveryWindowLabelForSubscription,
} from "./subscriptionScheduleService.js";

export const PAUSE_TYPES = {
  SKIP_NEXT_MEAL: "skip_next_meal",
  ONE_DAY: "1_day",
  SEVEN_DAYS: "7_days",
  INDEFINITE: "indefinite",
  /** User-chosen inclusive calendar range in mealSlotTimezone */
  CUSTOM_RANGE: "custom_range",
};

const MS_DAY = 24 * 60 * 60 * 1000;

/** @param {string} s */
export function parseYmdStrict(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const test = new Date(Date.UTC(y, mo - 1, d));
  if (test.getUTCFullYear() !== y || test.getUTCMonth() !== mo - 1 || test.getUTCDate() !== d) return null;
  return { y, mo, d };
}

export function localYmdToday(timeZone) {
  const tz = (timeZone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const w = wallClockFromUtc(Date.now(), tz);
  return `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/**
 * Inclusive calendar-day count from startYmd through endYmd in the given IANA zone.
 * @returns {number | null}
 */
export function inclusiveLocalCalendarDaysBetween(startYmd, endYmd, timeZone) {
  const tz = (timeZone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const a = parseYmdStrict(startYmd);
  const b = parseYmdStrict(endYmd);
  if (!a || !b) return null;
  const startMs = utcForWallClockMinute(a.y, a.mo, a.d, 0, 0, tz);
  const endMs = utcForWallClockMinute(b.y, b.mo, b.d, 0, 0, tz);
  if (startMs == null || endMs == null || endMs < startMs) return null;
  let cy = a.y;
  let cm = a.mo;
  let cd = a.d;
  let count = 0;
  for (;;) {
    count++;
    if (cy === b.y && cm === b.mo && cd === b.d) return count;
    if (count > 400) return null;
    const next = addCalendarDaysFromYmd(cy, cm, cd, 1, tz);
    cy = next.y;
    cm = next.mo;
    cd = next.d;
  }
}

/**
 * First instant deliveries resume: start of the local calendar day after pauseEndDate.
 * @returns {Date | null}
 */
export function pauseResumeInstantAfterRange(pauseEndDate, timeZone) {
  const tz = (timeZone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const p = parseYmdStrict(pauseEndDate);
  if (!p) return null;
  const next = addCalendarDaysFromYmd(p.y, p.mo, p.d, 1, tz);
  const t = utcForWallClockMinute(next.y, next.mo, next.d, 0, 0, tz);
  return t != null ? new Date(t) : null;
}

/**
 * Daily food subtotal from subscription items (one day of selected meals).
 */
export function computeDailyFoodTotal(items) {
  let sum = 0;
  for (const i of items || []) {
    sum += (Number(i.price) || 0) * (Number(i.quantity) || 1);
  }
  return Math.round(sum * 100) / 100;
}

export function computeDailyTotalWithDelivery(items, deliveryPerDay) {
  const food = computeDailyFoodTotal(items);
  const del = Math.max(0, Number(deliveryPerDay) || 0);
  return Math.round((food + del) * 100) / 100;
}

/**
 * Which meal category matches the scheduled nextDeliveryAt instant (wall clock in TZ).
 */
export function categoryForNextDelivery(sub, settings) {
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const deliveryMs = sub.nextDeliveryAt ? new Date(sub.nextDeliveryAt).getTime() : Date.now();
  const wall = wallClockFromUtc(deliveryMs, tz);
  const ranges = mergeMealSlotRanges(settings?.mealSlotTimes);
  const cats = getMealCategoriesFromItems(sub.items || []);
  const list = cats.length ? cats : ["lunch"];
  for (const cat of list) {
    const p = parseTimeString(ranges[cat]?.start);
    if (p && p.h === wall.h && p.m === wall.mi) return cat;
  }
  return sub.items?.find((i) => i.mealCategory)?.mealCategory || "lunch";
}

/**
 * Subtotal for items in a single meal category.
 */
export function mealCategorySubtotal(items, category) {
  let sum = 0;
  for (const i of items || []) {
    if (i.mealCategory === category) {
      sum += (Number(i.price) || 0) * (Number(i.quantity) || 1);
    }
  }
  return Math.round(sum * 100) / 100;
}

function ensureEndDate(sub) {
  if (sub.endDate) return;
  if (sub.startDate && sub.planDays) {
    const d = new Date(sub.startDate);
    d.setDate(d.getDate() + Number(sub.planDays));
    sub.endDate = d;
  }
}

export function extendSubscriptionEndDate(sub, extraDays) {
  const n = Math.max(0, Math.floor(Number(extraDays) || 0));
  if (n <= 0) return;
  ensureEndDate(sub);
  if (!sub.endDate) return;
  const d = new Date(sub.endDate);
  d.setDate(d.getDate() + n);
  sub.endDate = d;
}

/**
 * Remaining calendar days in plan (from getRemainingDays-style logic).
 */
export function remainingPlanDays(sub) {
  const end =
    sub.endDate ||
    (sub.startDate && sub.planDays
      ? new Date(new Date(sub.startDate).getTime() + sub.planDays * MS_DAY)
      : null);
  if (!end) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDay - today) / MS_DAY));
}

/**
 * Credit rupees for pause type; caps by remaining plan value.
 */
export function computePauseCreditRupees(pauseType, sub, settings) {
  const deliveryPerDay = Number(settings?.deliveryChargesPerDay) || 30;
  const dailyTotal = computeDailyTotalWithDelivery(sub.items, deliveryPerDay);
  const remaining = remainingPlanDays(sub);
  const maxByPlan = Math.round(dailyTotal * remaining * 100) / 100;

  switch (pauseType) {
    case PAUSE_TYPES.SKIP_NEXT_MEAL: {
      const cat = categoryForNextDelivery(sub, settings);
      const meal = mealCategorySubtotal(sub.items, cat);
      const share =
        meal > 0
          ? meal
          : dailyTotal > 0
            ? Math.round((dailyTotal / 4) * 100) / 100
            : 0;
      return Math.min(share, maxByPlan || share);
    }
    case PAUSE_TYPES.ONE_DAY: {
      return Math.min(dailyTotal, maxByPlan || dailyTotal);
    }
    case PAUSE_TYPES.SEVEN_DAYS: {
      const week = Math.round(dailyTotal * 7 * 100) / 100;
      return Math.min(week, maxByPlan || week);
    }
    case PAUSE_TYPES.INDEFINITE:
    default:
      return 0;
  }
}

/**
 * Wallet credit for pausing all deliveries from pauseStartDate through pauseEndDate (inclusive), in meal TZ.
 */
const MEAL_CATEGORY_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snacks: "Evening snacks",
  dinner: "Dinner",
};

/**
 * Rich preview for "skip next meal" (estimate API + dialog).
 * @param {object} sub - UserSubscription doc/lean
 * @param {object} settings - SubscriptionSettings
 */
export function getSkipNextMealPreview(sub, settings) {
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const cat = categoryForNextDelivery(sub, settings);
  const foodSubtotal = mealCategorySubtotal(sub.items, cat);
  const credit = computePauseCreditRupees(PAUSE_TYPES.SKIP_NEXT_MEAL, sub, settings);
  const deliveryMs = sub.nextDeliveryAt ? new Date(sub.nextDeliveryAt).getTime() : Date.now();
  const windowLabel = getDeliveryWindowLabelForSubscription(
    sub.items || [],
    settings?.mealSlotTimes,
    tz,
    deliveryMs,
  );
  const itemsInCategory = (sub.items || []).filter((i) => i.mealCategory === cat);
  const lineItems = itemsInCategory.map((i) => ({
    name: i.name,
    quantity: Number(i.quantity) || 1,
    lineTotal: Math.round((Number(i.price) || 0) * (Number(i.quantity) || 1) * 100) / 100,
  }));

  return {
    nextDeliveryAt: sub.nextDeliveryAt ? new Date(sub.nextDeliveryAt).toISOString() : null,
    mealCategory: cat,
    mealCategoryLabel: MEAL_CATEGORY_LABELS[cat] || cat,
    deliveryWindowLabel: windowLabel,
    skippedMealFoodSubtotal: foodSubtotal,
    estimatedWalletCredit: credit,
    planExtendsByDays: 1,
    lineItems,
    creditNote:
      "Wallet credit is the value of this meal slot (capped by your remaining plan). Your plan end date is extended by 1 day so you do not lose a paid day.",
  };
}

export function computePauseCreditCustomRange(pauseStartDate, pauseEndDate, sub, settings) {
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const inclusiveDays = inclusiveLocalCalendarDaysBetween(pauseStartDate, pauseEndDate, tz);
  if (inclusiveDays == null || inclusiveDays <= 0) return 0;
  const deliveryPerDay = Number(settings?.deliveryChargesPerDay) || 30;
  const dailyTotal = computeDailyTotalWithDelivery(sub.items, deliveryPerDay);
  const remaining = remainingPlanDays(sub);
  const maxByPlan = Math.round(dailyTotal * remaining * 100) / 100;
  const raw = Math.round(dailyTotal * inclusiveDays * 100) / 100;
  return Math.min(raw, maxByPlan || raw);
}

/**
 * Auto-resume timed pauses; recompute next delivery.
 */
export async function resumeExpiredPauses() {
  const now = new Date();
  const settings = await SubscriptionSettings.getSettings();
  const subs = await UserSubscription.find({
    status: "paused",
    pauseUntil: { $ne: null, $lte: now },
  });
  let count = 0;
  for (const sub of subs) {
    sub.status = "active";
    sub.pausedAt = null;
    sub.pauseUntil = null;
    sub.pauseType = null;
    sub.nextDeliveryAt = getNextMealDeliveryAt(sub.items || [], settings, now);
    await sub.save();
    count++;
  }
  return count;
}
