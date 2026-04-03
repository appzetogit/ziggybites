import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import * as flow from "../../order/services/subscriptionFlowService.js";

/**
 * PATCH /api/restaurant/orders/:orderId/preparation-status
 * Body: { preparationStatus: 'pending' | 'preparing' | 'ready' }
 */
export const patchSubscriptionPreparationStatus = asyncHandler(async (req, res) => {
  const { preparationStatus } = req.body;
  if (!preparationStatus) {
    return errorResponse(res, 400, "preparationStatus required");
  }
  try {
    const { order, duplicate } = await flow.updatePreparationStatus(
      req.params.orderId,
      req.restaurant._id,
      { preparationStatus },
    );
    return successResponse(res, 200, duplicate ? "No change" : "Preparation updated", {
      orderId: order._id,
      preparationStatus: order.preparationStatus,
      duplicate,
    });
  } catch (e) {
    return errorResponse(res, e.statusCode || 500, e.message);
  }
});
