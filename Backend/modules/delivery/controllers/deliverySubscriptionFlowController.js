import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import * as flow from "../../order/services/subscriptionFlowService.js";

/**
 * PATCH /api/delivery/orders/:orderId/flow-status
 * Body: { status: 'picked' | 'delivered' }
 */
export const patchSubscriptionFlowStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return errorResponse(res, 400, "status required");
  }
  try {
    const order = await flow.updateSubscriptionDeliveryStatus(
      req.params.orderId,
      req.delivery._id,
      status,
    );
    return successResponse(res, 200, "Status updated", {
      orderId: order._id,
      status: order.status,
    });
  } catch (e) {
    return errorResponse(res, e.statusCode || 500, e.message);
  }
});
