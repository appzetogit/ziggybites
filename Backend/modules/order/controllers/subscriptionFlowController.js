import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import * as flow from "../services/subscriptionFlowService.js";

/**
 * POST /api/order/change-meal/:orderId
 * Body: { items: [...] }
 */
export const changeMeal = asyncHandler(async (req, res) => {
  try {
    const data = await flow.changeMealForUser(req.params.orderId, req.user._id, req.body);
    return successResponse(res, 200, "Meal updated", data);
  } catch (e) {
    const code = e.statusCode || 500;
    if (e.paymentRequired) {
      return res.status(code).json({
        success: false,
        message: e.message,
        paymentRequired: true,
        amountDue: e.amountDue,
        upgradeAmount: e.upgradeAmount,
      });
    }
    return errorResponse(res, code, e.message || "Failed to change meal");
  }
});
