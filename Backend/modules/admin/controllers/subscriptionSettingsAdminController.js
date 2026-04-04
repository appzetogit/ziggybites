import SubscriptionSettings from "../../subscription/models/SubscriptionSettings.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  validateMealSlotTimesPayload,
  normalizeMealSlotRange,
} from "../../subscription/services/subscriptionScheduleService.js";

const MEAL_KEYS = ["breakfast", "lunch", "snacks", "dinner"];

function normalizeNotificationSettingsPayload(raw) {
  if (raw == null) return { ok: true, skip: true };
  if (typeof raw !== "object") {
    return { ok: false, message: "notificationSettings must be an object" };
  }

  const out = {};
  if (raw.mealReminderEnabled != null) {
    out.mealReminderEnabled = raw.mealReminderEnabled !== false;
  }
  if (raw.mealReminderLeadMinutes != null) {
    const lead = Number(raw.mealReminderLeadMinutes);
    if (!Number.isFinite(lead)) {
      return { ok: false, message: "mealReminderLeadMinutes must be a number" };
    }
    out.mealReminderLeadMinutes = Math.min(Math.max(Math.round(lead), 15), 360);
  }
  return { ok: true, partial: out };
}

function settingsToDto(settings) {
  const mt = settings.mealSlotTimes || {};
  const mealSlotTimes = {};
  for (const key of MEAL_KEYS) {
    mealSlotTimes[key] = normalizeMealSlotRange(mt[key], key);
  }
  return {
    deliveryChargesPerDay: settings.deliveryChargesPerDay ?? 30,
    mealSlotTimes,
    mealSlotTimezone: settings.mealSlotTimezone || "Asia/Kolkata",
    notificationSettings: {
      mealReminderEnabled: settings.notificationSettings?.mealReminderEnabled !== false,
      mealReminderLeadMinutes: Number.isFinite(Number(settings.notificationSettings?.mealReminderLeadMinutes))
        ? Math.min(Math.max(Math.round(Number(settings.notificationSettings?.mealReminderLeadMinutes)), 15), 360)
        : 120,
    },
  };
}

/**
 * GET /api/admin/subscription-settings
 */
export const getSubscriptionSettings = asyncHandler(async (req, res) => {
  const settings = await SubscriptionSettings.getSettings();
  return successResponse(res, 200, "Subscription settings retrieved", settingsToDto(settings));
});

/**
 * PUT /api/admin/subscription-settings
 * Body: { deliveryChargesPerDay?: number, mealSlotTimes?: { breakfast, lunch, snacks, dinner }, mealSlotTimezone?: string, notificationSettings?: { mealReminderEnabled?: boolean, mealReminderLeadMinutes?: number } }
 * At least one field required.
 */
export const updateSubscriptionSettings = asyncHandler(async (req, res) => {
  const { deliveryChargesPerDay, mealSlotTimes, mealSlotTimezone, notificationSettings } = req.body || {};

  const hasCharges = deliveryChargesPerDay != null && deliveryChargesPerDay !== "";
  const hasMealTimes = mealSlotTimes != null && typeof mealSlotTimes === "object";
  const hasTz = mealSlotTimezone != null && String(mealSlotTimezone).trim() !== "";
  const hasNotificationSettings = notificationSettings != null;

  if (!hasCharges && !hasMealTimes && !hasTz && !hasNotificationSettings) {
    return errorResponse(
      res,
      400,
      "Provide deliveryChargesPerDay, mealSlotTimes, mealSlotTimezone, and/or notificationSettings",
    );
  }

  let settings = await SubscriptionSettings.getSettings();

  if (hasCharges) {
    const charges = Math.max(0, Number(deliveryChargesPerDay));
    if (Number.isNaN(charges)) {
      return errorResponse(res, 400, "deliveryChargesPerDay must be a number");
    }
    settings.deliveryChargesPerDay = charges;
  }

  if (hasMealTimes) {
    const v = validateMealSlotTimesPayload(mealSlotTimes);
    if (!v.ok) {
      return errorResponse(res, 400, v.message);
    }
    settings.mealSlotTimes = settings.mealSlotTimes || {};
    for (const [k, val] of Object.entries(v.partial)) {
      settings.mealSlotTimes[k] = val;
    }
    settings.markModified("mealSlotTimes");
  }

  if (hasTz) {
    const tz = String(mealSlotTimezone).trim();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    } catch {
      return errorResponse(res, 400, "Invalid mealSlotTimezone (use an IANA name, e.g. Asia/Kolkata)");
    }
    settings.mealSlotTimezone = tz;
  }

  if (hasNotificationSettings) {
    const v = normalizeNotificationSettingsPayload(notificationSettings);
    if (!v.ok) {
      return errorResponse(res, 400, v.message);
    }
    if (!v.skip) {
      const current = settings.notificationSettings || {};
      settings.notificationSettings = {
        mealReminderEnabled:
          v.partial.mealReminderEnabled != null
            ? v.partial.mealReminderEnabled
            : current.mealReminderEnabled !== false,
        mealReminderLeadMinutes:
          v.partial.mealReminderLeadMinutes != null
            ? v.partial.mealReminderLeadMinutes
            : Number.isFinite(Number(current.mealReminderLeadMinutes))
              ? Math.min(Math.max(Math.round(Number(current.mealReminderLeadMinutes)), 15), 360)
              : 120,
      };
      settings.markModified("notificationSettings");
    }
  }

  await settings.save();
  return successResponse(res, 200, "Subscription settings updated", settingsToDto(settings));
});
