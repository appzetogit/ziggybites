import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Restaurant from "../models/Restaurant.js";

/**
 * Register or refresh FCM device token for the currently authenticated restaurant
 * POST /api/restaurant/auth/fcm-token
 * Body: { platform: 'web' | 'android' | 'ios', fcmToken }
 */
export const registerRestaurantFcmToken = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;
  const { platform, fcmToken } = req.body;

  if (!platform || !fcmToken) {
    return errorResponse(res, 400, "platform and fcmToken are required");
  }

  const validPlatforms = ["web", "android", "ios"];
  if (!validPlatforms.includes(platform)) {
    return errorResponse(
      res,
      400,
      "Invalid platform. Allowed values: web, android, ios",
    );
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  const addUniqueToken = (field) => {
    if (!Array.isArray(restaurant[field])) restaurant[field] = [];
    if (!restaurant[field].includes(fcmToken)) restaurant[field].push(fcmToken);
    if (restaurant[field].length > 10) restaurant[field] = restaurant[field].slice(-10);
  };

  if (platform === "web") {
    restaurant.fcmTokenWeb = fcmToken;
    addUniqueToken("fcmTokens");
  } else if (platform === "android") {
    restaurant.fcmTokenAndroid = fcmToken;
    addUniqueToken("fcmTokenMobile");
  } else if (platform === "ios") {
    restaurant.fcmTokenIos = fcmToken;
    addUniqueToken("fcmTokenMobile");
  }

  await restaurant.save();

  console.log(
    `[FCM] Updated ${platform} token for restaurant ${restaurant._id.toString()}`,
  );

  return successResponse(res, 200, "FCM token registered successfully", {
    fcmTokenWeb: restaurant.fcmTokenWeb,
    fcmTokenAndroid: restaurant.fcmTokenAndroid,
    fcmTokenIos: restaurant.fcmTokenIos,
    fcmTokens: restaurant.fcmTokens,
    fcmTokenMobile: restaurant.fcmTokenMobile,
  });
});

/**
 * Remove FCM token for the current restaurant device on logout
 * DELETE /api/restaurant/auth/fcm-token
 * Body: { platform: 'web' | 'android' | 'ios' }
 */
export const removeRestaurantFcmToken = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;
  const { platform, fcmToken } = req.body;

  if (!platform) {
    return errorResponse(res, 400, "platform is required");
  }

  const validPlatforms = ["web", "android", "ios"];
  if (!validPlatforms.includes(platform)) {
    return errorResponse(
      res,
      400,
      "Invalid platform. Allowed values: web, android, ios",
    );
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  if (platform === "web") {
    if (!fcmToken || restaurant.fcmTokenWeb === fcmToken) restaurant.fcmTokenWeb = null;
    restaurant.fcmTokens = fcmToken
      ? (restaurant.fcmTokens || []).filter((token) => token !== fcmToken)
      : [];
  } else if (platform === "android") {
    if (!fcmToken || restaurant.fcmTokenAndroid === fcmToken) restaurant.fcmTokenAndroid = null;
    restaurant.fcmTokenMobile = fcmToken
      ? (restaurant.fcmTokenMobile || []).filter((token) => token !== fcmToken)
      : [];
  } else if (platform === "ios") {
    if (!fcmToken || restaurant.fcmTokenIos === fcmToken) restaurant.fcmTokenIos = null;
    restaurant.fcmTokenMobile = fcmToken
      ? (restaurant.fcmTokenMobile || []).filter((token) => token !== fcmToken)
      : [];
  }

  await restaurant.save();

  return successResponse(res, 200, "FCM token removed successfully");
});
