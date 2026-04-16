import jwtService from "../../auth/services/jwtService.js";
import User from "../../auth/models/User.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Delivery from "../../delivery/models/Delivery.js";
import { errorResponse } from "../../../shared/utils/response.js";

const ROLE_CONFIG = {
  user: {
    model: User,
    requestKey: "user",
    activeMessage: "User account is inactive",
  },
  restaurant: {
    model: Restaurant,
    requestKey: "restaurant",
    activeMessage: "Restaurant account is inactive",
  },
  delivery: {
    model: Delivery,
    requestKey: "delivery",
    activeMessage: "Delivery account is inactive",
  },
};

export async function authenticateNotificationRecipient(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, 401, "No token provided");
    }

    const token = authHeader.substring(7);
    const decoded = jwtService.verifyAccessToken(token);
    const config = ROLE_CONFIG[decoded.role];

    if (!config) {
      return errorResponse(res, 403, "Unsupported notification role");
    }

    const entity = await config.model.findById(decoded.userId).select("-password -refreshToken");
    if (!entity) {
      return errorResponse(res, 401, "Authenticated account not found");
    }

    if (entity.isActive === false) {
      return errorResponse(res, 401, config.activeMessage);
    }

    req[config.requestKey] = entity;
    req.token = decoded;
    req.notificationRecipient = {
      role: decoded.role,
      entityId: entity._id,
    };

    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid token");
  }
}
