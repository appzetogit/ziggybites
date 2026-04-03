import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Order from "../models/Order.js";
import * as flow from "../services/subscriptionFlowService.js";

/**
 * POST /api/admin/subscription-flow/assign-orders
 * Body: { orderIds: string[], deliveryBoyId: string }
 */
export const assignSubscriptionOrders = asyncHandler(async (req, res) => {
  const { orderIds, deliveryBoyId } = req.body;
  if (!Array.isArray(orderIds) || orderIds.length === 0 || !deliveryBoyId) {
    return errorResponse(res, 400, "orderIds (non-empty array) and deliveryBoyId required");
  }
  const result = await flow.assignOrdersToDeliveryPartner(orderIds, deliveryBoyId);
  return successResponse(res, 200, "Orders assigned", {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  });
});

/** Future subscription meals (scheduledMealAt > now) */
export const getScheduledSubscriptionOrders = asyncHandler(async (req, res) => {
  const now = new Date();
  const orders = await Order.find({
    "source.type": "subscription",
    scheduledMealAt: { $gt: now },
    status: { $nin: ["cancelled", "delivered", "skipped"] },
  })
    .sort({ scheduledMealAt: 1 })
    .limit(500)
    .lean();
  return successResponse(res, 200, "Scheduled orders", { orders, count: orders.length });
});

/** Today's subscription orders by scheduledMealAt date (server local calendar day). */
export const getTodaySubscriptionOrders = asyncHandler(async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const orders = await Order.find({
    "source.type": "subscription",
    scheduledMealAt: { $gte: start, $lte: end },
  })
    .sort({ scheduledMealAt: 1 })
    .limit(500)
    .lean();
  return successResponse(res, 200, "Today's orders", { orders, count: orders.length });
});

/**
 * Groups for assignment UI: restaurant + delivery area bucket (hour of scheduledMealAt).
 */
export const getOrdersGroupedForAssignment = asyncHandler(async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + 2);
  end.setHours(23, 59, 59, 999);

  const groups = await Order.aggregate([
    {
      $match: {
        "source.type": "subscription",
        scheduledMealAt: { $gte: start, $lte: end },
        status: { $in: ["pending", "scheduled", "confirmed"] },
        $or: [
          { deliveryBoyId: null },
          { deliveryBoyId: { $exists: false } },
        ],
      },
    },
    {
      $group: {
        _id: {
          restaurantId: "$restaurantId",
          hour: { $hour: "$scheduledMealAt" },
        },
        orderIds: { $push: "$_id" },
        count: { $sum: 1 },
        scheduledMealAt: { $first: "$scheduledMealAt" },
      },
    },
    { $sort: { "_id.restaurantId": 1, "_id.hour": 1 } },
  ]);

  return successResponse(res, 200, "Grouped orders", { groups });
});
