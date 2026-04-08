import SubscriptionSettings from "../models/SubscriptionSettings.js";
import { normalizeMealSlotRange } from "../services/subscriptionScheduleService.js";

const MEAL_KEYS = ["breakfast", "lunch", "snacks", "dinner"];

function notificationSettingsDto(settings) {
  const ns = settings?.notificationSettings || {};
  const lead = Number(ns.mealReminderLeadMinutes);
  return {
    mealReminderEnabled: ns.mealReminderEnabled !== false,
    mealReminderLeadMinutes: Number.isFinite(lead) ? Math.min(Math.max(Math.round(lead), 15), 1440) : 1440,
  };
}

/**
 * GET /subscription/settings (public - delivery charges + meal delivery windows for UI)
 */
export const getSubscriptionSettings = async (req, res) => {
  try {
    const settings = await SubscriptionSettings.getSettings();
    const mealSlotTimes = {};
    for (const key of MEAL_KEYS) {
      mealSlotTimes[key] = normalizeMealSlotRange(settings.mealSlotTimes?.[key], key);
    }
    return res.status(200).json({
      success: true,
      data: {
        deliveryChargesPerDay: settings.deliveryChargesPerDay ?? 30,
        mealSlotTimes,
        mealSlotTimezone: settings.mealSlotTimezone || "Asia/Kolkata",
        notificationSettings: notificationSettingsDto(settings),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
