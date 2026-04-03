import SubscriptionSettings from "../../subscription/models/SubscriptionSettings.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  validateMealSlotTimesPayload,
  normalizeMealSlotRange,
} from "../../subscription/services/subscriptionScheduleService.js";

const MEAL_KEYS = ["breakfast", "lunch", "snacks", "dinner"];

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
 * Body: { deliveryChargesPerDay?: number, mealSlotTimes?: { breakfast, lunch, snacks, dinner }, mealSlotTimezone?: string }
 * At least one field required.
 */
export const updateSubscriptionSettings = asyncHandler(async (req, res) => {
  const { deliveryChargesPerDay, mealSlotTimes, mealSlotTimezone } = req.body || {};

  const hasCharges = deliveryChargesPerDay != null && deliveryChargesPerDay !== "";
  const hasMealTimes = mealSlotTimes != null && typeof mealSlotTimes === "object";
  const hasTz = mealSlotTimezone != null && String(mealSlotTimezone).trim() !== "";

  if (!hasCharges && !hasMealTimes && !hasTz) {
    return errorResponse(res, 400, "Provide deliveryChargesPerDay, mealSlotTimes, and/or mealSlotTimezone");
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

  await settings.save();
  return successResponse(res, 200, "Subscription settings updated", settingsToDto(settings));
});
