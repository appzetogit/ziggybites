import SubscriptionPlan from "../../subscription/models/SubscriptionPlan.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

const DEFAULT_BENEFITS = [
  "2-hour prior delivery notification before each meal",
  "Modify, skip, or confirm each delivery",
  "Subscribe from any restaurant on Home",
  "No refunds on cancellation (ZigZagLite policy)",
].join("\n");

const DEFAULT_PLANS = [
  { durationDays: 15, name: "15 Days", priceType: "dynamic", active: true, benefits: DEFAULT_BENEFITS },
  { durationDays: 30, name: "30 Days", priceType: "dynamic", active: true, benefits: DEFAULT_BENEFITS },
  { durationDays: 90, name: "90 Days", priceType: "dynamic", active: true, benefits: DEFAULT_BENEFITS },
];

async function ensurePlansExist() {
  const count = await SubscriptionPlan.countDocuments();
  if (count === 0) {
    await SubscriptionPlan.insertMany(DEFAULT_PLANS);
  }
}

/**
 * GET /api/admin/subscription-plans
 */
export const getSubscriptionPlans = asyncHandler(async (req, res) => {
  await ensurePlansExist();
  const plans = await SubscriptionPlan.find().sort({ durationDays: 1 }).lean();
  const data = plans.length ? plans : DEFAULT_PLANS;
  return successResponse(res, 200, "Subscription plans retrieved", data);
});

/**
 * POST /api/admin/subscription-plans
 * Body: { durationDays, name, description?, active?, benefits?, mealTypesEnabled?: { breakfast, lunch, snacks, dinner } }
 * Admin CANNOT set price - pricing is dynamic based on selected food + delivery.
 */
export const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const { durationDays, name, description, active, benefits, mealTypesEnabled } = req.body;
  const duration = durationDays != null ? parseInt(String(durationDays), 10) : null;
  if (!Number.isInteger(duration) || duration <= 0) {
    return errorResponse(res, 400, "durationDays must be a positive integer (days).");
  }
  const existing = await SubscriptionPlan.findOne({ durationDays: duration });
  if (existing) {
    return errorResponse(res, 400, "A plan with this duration already exists. Edit it instead.");
  }
  const mealTypes = mealTypesEnabled && typeof mealTypesEnabled === "object"
    ? {
        breakfast: mealTypesEnabled.breakfast !== false,
        lunch: mealTypesEnabled.lunch !== false,
        snacks: mealTypesEnabled.snacks !== false,
        dinner: mealTypesEnabled.dinner !== false,
      }
    : { breakfast: true, lunch: true, snacks: true, dinner: true };

  const plan = await SubscriptionPlan.create({
    durationDays: duration,
    name: name && String(name).trim() ? String(name).trim() : `${duration} Days`,
    description: description != null ? String(description) : "",
    priceType: "dynamic",
    active: active !== false,
    benefits: benefits != null ? String(benefits) : DEFAULT_BENEFITS,
    mealTypesEnabled: mealTypes,
  });
  return successResponse(res, 201, "Plan created", plan);
});

/**
 * PUT /api/admin/subscription-plans/:durationDays
 * Body: { name?, description?, active?, benefits?, mealTypesEnabled?: { breakfast, lunch, snacks, dinner } }
 * Admin CANNOT set price - pricing is dynamic.
 */
export const updateSubscriptionPlan = asyncHandler(async (req, res) => {
  const durationDays = parseInt(req.params.durationDays, 10);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    return errorResponse(res, 400, "Invalid durationDays. Must be a positive integer (days).");
  }
  const { name, description, active, benefits, mealTypesEnabled } = req.body;
  const update = {};
  if (name !== undefined) update.name = String(name);
  if (description !== undefined) update.description = String(description);
  if (active !== undefined) update.active = Boolean(active);
  if (benefits !== undefined) update.benefits = String(benefits);
  if (mealTypesEnabled && typeof mealTypesEnabled === "object") {
    update.mealTypesEnabled = {
      breakfast: mealTypesEnabled.breakfast !== false,
      lunch: mealTypesEnabled.lunch !== false,
      snacks: mealTypesEnabled.snacks !== false,
      dinner: mealTypesEnabled.dinner !== false,
    };
  }

  const plan = await SubscriptionPlan.findOneAndUpdate(
    { durationDays },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!plan) {
    return errorResponse(res, 404, "Subscription plan not found");
  }
  return successResponse(res, 200, "Plan updated", plan);
});

/**
 * DELETE /api/admin/subscription-plans/:durationDays
 */
export const deleteSubscriptionPlan = asyncHandler(async (req, res) => {
  const durationDays = parseInt(req.params.durationDays, 10);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    return errorResponse(res, 400, "Invalid durationDays. Must be a positive integer (days).");
  }
  const plan = await SubscriptionPlan.findOneAndDelete({ durationDays });
  if (!plan) {
    return errorResponse(res, 404, "Subscription plan not found");
  }
  return successResponse(res, 200, "Plan removed", { durationDays });
});
