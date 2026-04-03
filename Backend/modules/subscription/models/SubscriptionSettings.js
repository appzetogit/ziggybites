import mongoose from "mongoose";
import {
  DEFAULT_MEAL_SLOT_RANGES,
  normalizeMealSlotRange,
  addMinutesToHHmm,
  parseTimeString,
} from "../services/subscriptionScheduleService.js";

const MEAL_KEYS = ["breakfast", "lunch", "snacks", "dinner"];

function defaultMealSlotTimesObject() {
  return {
    breakfast: { ...DEFAULT_MEAL_SLOT_RANGES.breakfast },
    lunch: { ...DEFAULT_MEAL_SLOT_RANGES.lunch },
    snacks: { ...DEFAULT_MEAL_SLOT_RANGES.snacks },
    dinner: { ...DEFAULT_MEAL_SLOT_RANGES.dinner },
  };
}

/**
 * Migrate legacy string "HH:mm" or partial objects to { start, end }.
 */
function migrateMealSlotTimesInPlace(mt) {
  if (!mt || typeof mt !== "object") {
    return { out: defaultMealSlotTimesObject(), changed: true };
  }
  let changed = false;
  const out = { ...mt };
  for (const key of MEAL_KEYS) {
    const v = out[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (parseTimeString(t)) {
        out[key] = { start: t, end: addMinutesToHHmm(t, 60) };
      } else {
        out[key] = { ...DEFAULT_MEAL_SLOT_RANGES[key] };
      }
      changed = true;
      continue;
    }
    if (v && typeof v === "object") {
      const n = normalizeMealSlotRange(v, key);
      if (n.start !== v.start || n.end !== v.end || !v.end) {
        out[key] = n;
        changed = true;
      }
    } else if (!v) {
      out[key] = { ...DEFAULT_MEAL_SLOT_RANGES[key] };
      changed = true;
    }
  }
  return { out, changed };
}

const subscriptionSettingsSchema = new mongoose.Schema(
  {
    deliveryChargesPerDay: {
      type: Number,
      default: 30,
      min: 0,
    },
    /** Per meal: { start, end } in HH:mm (delivery window, e.g. 09:00–10:00) */
    mealSlotTimes: {
      type: mongoose.Schema.Types.Mixed,
      default: () => defaultMealSlotTimesObject(),
    },
    mealSlotTimezone: {
      type: String,
      default: "Asia/Kolkata",
      trim: true,
    },
  },
  { timestamps: true }
);

subscriptionSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      deliveryChargesPerDay: 30,
      mealSlotTimes: defaultMealSlotTimesObject(),
      mealSlotTimezone: "Asia/Kolkata",
    });
    return settings;
  }
  const { out, changed } = migrateMealSlotTimesInPlace(settings.mealSlotTimes);
  let saveNeeded = false;
  if (changed || !settings.mealSlotTimes) {
    settings.mealSlotTimes = out;
    settings.markModified("mealSlotTimes");
    saveNeeded = true;
  }
  if (!settings.mealSlotTimezone) {
    settings.mealSlotTimezone = "Asia/Kolkata";
    saveNeeded = true;
  }
  if (saveNeeded) await settings.save();
  return settings;
};

export default mongoose.model("SubscriptionSettings", subscriptionSettingsSchema);
