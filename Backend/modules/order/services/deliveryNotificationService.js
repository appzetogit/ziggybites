import Order from "../models/Order.js";
import Delivery from "../../delivery/models/Delivery.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import { getActiveAssignedOrderCount } from "../../delivery/services/batchAssignmentService.js";
import mongoose from "mongoose";
import { sendEntityPushNotification } from "./pushNotificationService.js";
import googleMapsService from "./googleMapsService.js";

// Dynamic import to avoid circular dependency
let getIO = null;
const LOCATION_UNAVAILABLE = "Location unavailable";

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import("../../../server.js");
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

/**
 * Check if delivery partner is connected to socket
 * @param {string} deliveryPartnerId - Delivery partner ID
 * @returns {Promise<{connected: boolean, room: string|null, socketCount: number}>}
 */
async function checkDeliveryPartnerConnection(deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    if (!io) {
      return { connected: false, room: null, socketCount: 0 };
    }

    const deliveryNamespace = io.of("/delivery");
    const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;

    const roomVariations = [
      `delivery:${normalizedId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedId)
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`]
        : []),
    ];

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        return { connected: true, room, socketCount: sockets.length };
      }
    }

    return { connected: false, room: null, socketCount: 0 };
  } catch (error) {
    console.error("Error checking delivery partner connection:", error);
    return { connected: false, room: null, socketCount: 0 };
  }
}

/**
 * Redact sensitive PII from order data for broad notifications
 * @param {Object} data - Notification data
 * @returns {Object} Redacted data
 */
function redactPII(data) {
  const redacted = { ...data };

  // Hide exact customer phone
  if (redacted.customerPhone) {
    redacted.customerPhone = redacted.customerPhone.replace(/.(?=.{4})/g, "*");
  }

  // Scramble/Generalized delivery address
  if (redacted.customerLocation?.address) {
    // Keep only the area/city part if possible, or just truncate the specific part
    const parts = redacted.customerLocation.address.split(",");
    if (parts.length > 2) {
      redacted.customerLocation.address = `Near ${parts[parts.length - 2].trim()}, ${parts[parts.length - 1].trim()}`;
    } else {
      redacted.customerLocation.address =
        "Drop location restricted (Accept to view)";
    }
  }

  if (redacted.deliveryAddress) {
    const parts = redacted.deliveryAddress.split(",");
    if (parts.length > 2) {
      redacted.deliveryAddress = `Near ${parts[parts.length - 2].trim()}, ${parts[parts.length - 1].trim()}`;
    } else {
      redacted.deliveryAddress = "Drop location restricted (Accept to view)";
    }
  }

  // Remove full order object if present to prevent leaks
  delete redacted.fullOrder;

  return redacted;
}

function isValidCoordinate(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue);
}

function normalizePoint(point) {
  if (!point) return null;

  const latitude = point.latitude ?? point.lat;
  const longitude = point.longitude ?? point.lng;

  if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

function getRestaurantAddress(restaurant) {
  return (
    restaurant?.location?.formattedAddress ||
    restaurant?.location?.address ||
    restaurant?.address ||
    LOCATION_UNAVAILABLE
  );
}

function getCustomerAddress(order) {
  return (
    order?.address?.formattedAddress ||
    order?.deliveryAddress ||
    [order?.address?.street, order?.address?.city, order?.address?.state]
      .filter(Boolean)
      .join(", ") ||
    LOCATION_UNAVAILABLE
  );
}

function getRestaurantPoint(restaurant) {
  const coordinates = restaurant?.location?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return normalizePoint({
      latitude: coordinates[1],
      longitude: coordinates[0],
    });
  }

  return normalizePoint(restaurant?.location);
}

function getCustomerPoint(order) {
  const coordinates = order?.address?.location?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return normalizePoint({
      latitude: coordinates[1],
      longitude: coordinates[0],
    });
  }

  return normalizePoint(order?.address?.location);
}

function getDeliveryPartnerPoint(deliveryPartner) {
  const coordinates = deliveryPartner?.availability?.currentLocation?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return normalizePoint({
      latitude: coordinates[1],
      longitude: coordinates[0],
    });
  }

  return normalizePoint(deliveryPartner?.availability?.currentLocation);
}

function logMissingCoordinates(label, point) {
  const missingFields = [];
  if (!point || !isValidCoordinate(point.latitude)) missingFields.push("latitude");
  if (!point || !isValidCoordinate(point.longitude)) missingFields.push("longitude");

  if (missingFields.length > 0) {
    console.warn(
      `⚠️ Missing coordinates for ${label}: ${missingFields.join(", ")}`,
      point,
    );
    return true;
  }

  return false;
}

function formatDistance(distanceKm) {
  const numericValue = Number(distanceKm);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? `${numericValue.toFixed(2)} km`
    : LOCATION_UNAVAILABLE;
}

function formatDuration(durationMinutes) {
  const numericValue = Number(durationMinutes);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? `${Math.max(1, Math.ceil(numericValue))} mins`
    : LOCATION_UNAVAILABLE;
}

function countOrderItems(items = []) {
  return items.reduce(
    (total, item) => total + (Number(item?.quantity) > 0 ? Number(item.quantity) : 0),
    0,
  );
}

async function resolveRestaurant(order) {
  const restaurantRef = order?.restaurantId;

  if (!restaurantRef) {
    return null;
  }

  if (typeof restaurantRef === "object" && restaurantRef.location) {
    return restaurantRef;
  }

  if (mongoose.Types.ObjectId.isValid(restaurantRef)) {
    const byMongoId = await Restaurant.findById(restaurantRef).lean();
    if (byMongoId) return byMongoId;
  }

  return Restaurant.findOne({
    $or: [{ restaurantId: restaurantRef }, { _id: restaurantRef }],
  }).lean();
}

async function calculateTravelMetrics(origin, destination, label) {
  const missingOrigin = logMissingCoordinates(`${label} origin`, origin);
  const missingDestination = logMissingCoordinates(`${label} destination`, destination);

  if (missingOrigin || missingDestination) {
    return null;
  }

  try {
    const metrics = await googleMapsService.getTravelTime(origin, destination, "driving");
    return {
      distanceKm: Number(metrics?.distance) || 0,
      durationMinutes: Number(metrics?.duration) || 0,
      trafficLevel: metrics?.trafficLevel || "low",
    };
  } catch (error) {
    console.error(`❌ Distance API failed for ${label}, using fallback`, error.message);
    try {
      const fallback = googleMapsService.calculateHaversineDistance(origin, destination);
      return {
        distanceKm: Number(fallback?.distance) || 0,
        durationMinutes: Number(fallback?.duration) || 0,
        trafficLevel: fallback?.trafficLevel || "low",
      };
    } catch (fallbackError) {
      console.error(`❌ Distance fallback failed for ${label}`, fallbackError.message);
      return null;
    }
  }
}

async function buildAssignmentPayload({
  order,
  deliveryPartner,
  phase = null,
  activeAssignedOrderCount = 0,
  nextDeliveryLocation = null,
}) {
  if (!order?._id || !order?.orderId) {
    console.warn("⚠️ Assignment payload build skipped: orderId or _id missing", {
      mongoId: order?._id,
      orderId: order?.orderId,
    });
    return null;
  }

  if (!order?.userId) {
    console.warn(`⚠️ User not found for order ${order.orderId}. Skipping emit.`);
    return null;
  }

  const restaurant = await resolveRestaurant(order);
  if (!restaurant) {
    console.warn(`⚠️ Restaurant not found for order ${order.orderId}. Skipping emit.`);
    return null;
  }

  const riderPoint = getDeliveryPartnerPoint(deliveryPartner);
  const restaurantPoint = getRestaurantPoint(restaurant);
  const customerPoint = getCustomerPoint(order);

  const pickupTravel = await calculateTravelMetrics(
    riderPoint,
    restaurantPoint,
    `pickup for order ${order.orderId}`,
  );
  const dropTravel = await calculateTravelMetrics(
    restaurantPoint,
    customerPoint,
    `drop for order ${order.orderId}`,
  );

  const totalDistanceKm =
    (pickupTravel?.distanceKm || 0) + (dropTravel?.distanceKm || 0);
  const totalDurationMinutes =
    (pickupTravel?.durationMinutes || 0) + (dropTravel?.durationMinutes || 0);

  const deliveryFeeFromOrder = order.pricing?.deliveryFee ?? 0;
  let estimatedEarnings = await calculateEstimatedEarnings(dropTravel?.distanceKm || 0);
  const earnedValue =
    typeof estimatedEarnings === "object"
      ? Number(estimatedEarnings.totalEarning) || 0
      : Number(estimatedEarnings) || 0;

  if (earnedValue <= 0 && deliveryFeeFromOrder > 0) {
    estimatedEarnings =
      typeof estimatedEarnings === "object"
        ? { ...estimatedEarnings, totalEarning: deliveryFeeFromOrder }
        : deliveryFeeFromOrder;
  }

  const customerName =
    typeof order.userId === "object" ? order.userId?.name || "Customer" : "Customer";
  const customerPhone =
    typeof order.userId === "object" ? order.userId?.phone || "" : "";

  return {
    orderId: order.orderId,
    orderMongoId: order._id.toString(),
    orderMongoDbId: order._id.toString(),
    restaurantId:
      restaurant?._id?.toString?.() || restaurant?.restaurantId || String(order.restaurantId),
    restaurantName: restaurant?.name || order.restaurantName || "Restaurant",
    restaurantAddress: getRestaurantAddress(restaurant),
    restaurantLocation: {
      latitude: restaurantPoint?.latitude ?? null,
      longitude: restaurantPoint?.longitude ?? null,
      address: getRestaurantAddress(restaurant),
      formattedAddress: getRestaurantAddress(restaurant),
    },
    customerName,
    customerPhone,
    customerAddress: getCustomerAddress(order),
    deliveryAddress: getCustomerAddress(order),
    customerLocation: {
      latitude: customerPoint?.latitude ?? null,
      longitude: customerPoint?.longitude ?? null,
      address: getCustomerAddress(order),
    },
    deliveryBoyLocation: {
      latitude: riderPoint?.latitude ?? null,
      longitude: riderPoint?.longitude ?? null,
    },
    pickupDistance: formatDistance(pickupTravel?.distanceKm),
    pickupDistanceKm: pickupTravel?.distanceKm ?? null,
    dropDistance: formatDistance(dropTravel?.distanceKm),
    deliveryDistance: formatDistance(dropTravel?.distanceKm),
    deliveryDistanceKm: dropTravel?.distanceKm ?? null,
    totalDistance: formatDistance(totalDistanceKm),
    totalDistanceKm: Number.isFinite(totalDistanceKm) ? Number(totalDistanceKm.toFixed(2)) : null,
    estimatedPickupTime: formatDuration(pickupTravel?.durationMinutes),
    estimatedPickupTimeMinutes: pickupTravel?.durationMinutes ?? null,
    estimatedDropTime: formatDuration(dropTravel?.durationMinutes),
    estimatedDropTimeMinutes: dropTravel?.durationMinutes ?? null,
    estimatedTotalTime: formatDuration(totalDurationMinutes),
    estimatedTotalTimeMinutes: Number.isFinite(totalDurationMinutes)
      ? Math.max(1, Math.ceil(totalDurationMinutes))
      : null,
    estimatedEarnings,
    paymentMode: order.payment?.method || "cash",
    paymentMethod: order.payment?.method || "cash",
    orderItemsCount: countOrderItems(order.items || []),
    items: (order.items || []).map((item) => ({
      itemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    total: order.pricing?.total || 0,
    totalAmount: order.pricing?.total || 0,
    deliveryFee: deliveryFeeFromOrder,
    note: order.note || "",
    status: order.status,
    preparationStatus: order.preparationStatus,
    createdAt: order.createdAt,
    phase,
    activeAssignedOrderCount,
    nextDeliveryLocation,
  };
}

/**
 * Notify delivery boy about new order assignment via Socket.IO
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyNewOrder(order, deliveryPartnerId) {
  // CRITICAL: Don't notify if order is cancelled
  if (order.status === "cancelled") {
    console.log(
      `⚠️ Order ${order.orderId} is cancelled. Cannot notify delivery partner.`,
    );
    return { success: false, reason: "Order is cancelled" };
  }
  if (order.status !== "ready" && order.preparationStatus !== "ready") {
    console.log(
      `⏳ Order ${order.orderId} is not ready yet. Skipping delivery notification.`,
    );
    return { success: false, reason: "Order is not ready" };
  }
  try {
    const io = await getIOInstance();

    if (!io) {
      console.warn(
        "Socket.IO not initialized, skipping delivery boy notification",
      );
      return;
    }

    // Populate userId if it's not already populated
    let orderWithUser = order;
    if (order.userId && typeof order.userId === "object" && order.userId._id) {
      // Already populated
      orderWithUser = order;
    } else if (order.userId) {
      // Need to populate
      const OrderModel = await import("../models/Order.js");
      orderWithUser = await OrderModel.default
        .findById(order._id)
        .populate("userId", "name phone")
        .lean();
    }

    // Get delivery partner details
    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select(
        "name phone availability.currentLocation availability.isOnline status isActive assignedOrders route",
      )
      .lean();

    if (!deliveryPartner) {
      console.error(`❌ Delivery partner not found: ${deliveryPartnerId}`);
      return;
    }

    // Verify delivery partner is online and active
    if (!deliveryPartner.availability?.isOnline) {
      console.warn(
        `⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not online. Notification may not be received.`,
      );
    }

    if (!deliveryPartner.isActive) {
      console.warn(
        `⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not active.`,
      );
    }

    if (
      !deliveryPartner.availability?.currentLocation?.coordinates ||
      (deliveryPartner.availability.currentLocation.coordinates[0] === 0 &&
        deliveryPartner.availability.currentLocation.coordinates[1] === 0)
    ) {
      console.warn(
        `⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) has no valid location.`,
      );
    }

    console.log(`📋 Delivery partner details:`, {
      id: deliveryPartnerId,
      name: deliveryPartner.name,
      isOnline: deliveryPartner.availability?.isOnline,
      isActive: deliveryPartner.isActive,
      status: deliveryPartner.status,
      hasLocation: !!deliveryPartner.availability?.currentLocation?.coordinates,
    });

    // Check if delivery partner is connected to socket BEFORE trying to notify
    const connectionStatus =
      await checkDeliveryPartnerConnection(deliveryPartnerId);
    console.log(
      `Delivery partner socket connection status:`,
      connectionStatus,
    );

    if (!connectionStatus.connected) {
      console.warn(
        `Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is NOT connected to socket!`,
      );
      console.warn(
        `Notification will be sent but may not be received until they reconnect.`,
      );
    } else {
      console.log(
        `Delivery partner ${deliveryPartnerId} is connected via socket in room: ${connectionStatus.room}`,
      );
    }

    const orderNotification = await buildAssignmentPayload({
      order: orderWithUser,
      deliveryPartner,
      activeAssignedOrderCount: getActiveAssignedOrderCount(deliveryPartner),
      nextDeliveryLocation: deliveryPartner?.route?.[0]
        ? {
            orderId:
              deliveryPartner.route[0].orderId?.toString?.() ||
              deliveryPartner.route[0].orderId,
            orderCode: deliveryPartner.route[0].orderCode,
            latitude: deliveryPartner.route[0].latitude,
            longitude: deliveryPartner.route[0].longitude,
            status: deliveryPartner.route[0].status,
            sequence: deliveryPartner.route[0].sequence,
          }
        : null,
    });

    if (!orderNotification) {
      return { success: false, reason: "Assignment payload incomplete" };
    }

    const deliveryNamespace = io.of("/delivery");
    const normalizedDeliveryPartnerId =
      deliveryPartnerId?.toString() || deliveryPartnerId;
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId)
        ? [
            `delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`,
          ]
        : []),
    ];

    let socketsInRoom = [];
    let foundRoom = null;
    const allSockets = await deliveryNamespace.fetchSockets();
    console.log(`Total connected delivery sockets: ${allSockets.length}`);

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        foundRoom = room;
        console.log(`Found ${sockets.length} socket(s) in room: ${room}`);
        console.log(
          `Socket IDs in room:`,
          sockets.map((s) => s.id),
        );
        break;
      }
    }

    console.log(
      `Attempting to notify delivery partner ${normalizedDeliveryPartnerId} about order ${order.orderId}`,
    );

    let notificationSent = false;
    roomVariations.forEach((room) => {
      deliveryNamespace.to(room).emit("new_order", orderNotification);
      deliveryNamespace.to(room).emit("play_notification_sound", {
        type: "new_order",
        orderId: order.orderId,
        message: `New order assigned: ${order.orderId}`,
      });
      notificationSent = true;
      console.log(`Emitted targeted notification to room: ${room}`);
    });

    if (socketsInRoom.length === 0) {
      console.warn(
        `No sockets connected for partner ${normalizedDeliveryPartnerId}. Targeted socket emit completed without broadcast fallback.`,
      );
    } else {
      console.log(
        `Successfully found connected socket(s) for delivery partner ${normalizedDeliveryPartnerId}`,
      );
      console.log(`Targeted notification sent to room: ${foundRoom}`);
    }

    if (notificationSent) {
      console.log(
        `Notification emitted for order ${order.orderId} to delivery partner ${normalizedDeliveryPartnerId}`,
      );
    } else {
      console.error(`Failed to send notification`);
    }

    await sendEntityPushNotification(normalizedDeliveryPartnerId, "delivery", {
      title: "New Delivery Assignment",
      body: `${order.restaurantName || "A restaurant"} assigned order ${order.orderId}`,
      data: {
        type: "delivery_new_order",
        orderId: order.orderId,
        orderMongoId: order._id?.toString(),
        status: order.status,
        restaurantName: order.restaurantName || "",
      },
    });

    return {
      success: true,
      deliveryPartnerId,
      orderId: order.orderId,
    };
  } catch (error) {
    console.error("Error notifying delivery boy:", error);
    throw error;
  }
}

/**
 * Notify multiple delivery boys about new order (without assigning)
 * Used for priority-based notification where nearest delivery boys get first chance
 * @param {Object} order - Order document
 * @param {Array} deliveryPartnerIds - Array of delivery partner IDs to notify
 * @param {string} phase - Notification phase: 'priority' or 'expanded'
 * @returns {Promise<{success: boolean, notified: number}>}
 */
export async function notifyMultipleDeliveryBoys(
  order,
  deliveryPartnerIds,
  phase = "priority",
) {
  try {
    if (order.status !== "ready" && order.preparationStatus !== "ready") {
      console.log(
        `⏳ Order ${order.orderId || order._id} is not ready yet. Skipping delivery availability notifications.`,
      );
      return { success: false, notified: 0, reason: "Order is not ready" };
    }

    if (!deliveryPartnerIds || deliveryPartnerIds.length === 0) {
      return { success: false, notified: 0 };
    }

    const io = await getIOInstance();
    if (!io) {
      console.warn(
        "Socket.IO not initialized, skipping delivery boy notifications",
      );
      return { success: false, notified: 0 };
    }

    const deliveryNamespace = io.of("/delivery");
    let notifiedCount = 0;
    const deliveryPartners = await Delivery.find({
      _id: { $in: deliveryPartnerIds },
    })
      .select(
        "name phone availability.currentLocation availability.isOnline status isActive assignedOrders route",
      )
      .lean();
    const deliveryPartnerMap = new Map(
      deliveryPartners.map((partner) => [partner._id.toString(), partner]),
    );

    // Populate userId if needed
    let orderWithUser = order;
    if (order.userId && typeof order.userId === "object" && order.userId._id) {
      orderWithUser = order;
    } else if (order.userId) {
      const OrderModel = await import("../models/Order.js");
      orderWithUser = await OrderModel.default
        .findById(order._id)
        .populate("userId", "name phone")
        .lean();
    }

    // Get restaurant details for complete address
    let restaurantAddress = "Restaurant address";
    let restaurantLocation = null;

    if (orderWithUser.restaurantId) {
      // If restaurantId is populated, use it directly
      if (typeof orderWithUser.restaurantId === "object") {
        restaurantAddress =
          orderWithUser.restaurantId.address ||
          orderWithUser.restaurantId.location?.formattedAddress ||
          orderWithUser.restaurantId.location?.address ||
          "Restaurant address";
        restaurantLocation = orderWithUser.restaurantId.location;
      } else {
        // If restaurantId is just an ID, fetch restaurant details
        try {
          const RestaurantModel =
            await import("../../restaurant/models/Restaurant.js");
          const restaurant = await RestaurantModel.default
            .findById(orderWithUser.restaurantId)
            .select("name address location")
            .lean();
          if (restaurant) {
            restaurantAddress =
              restaurant.address ||
              restaurant.location?.formattedAddress ||
              restaurant.location?.address ||
              "Restaurant address";
            restaurantLocation = restaurant.location;
          }
        } catch (e) {
          console.warn(
            "⚠️ Could not fetch restaurant details for notification:",
            e.message,
          );
        }
      }
    }

    // Calculate delivery distance (restaurant to customer) for earnings calculation
    let deliveryDistance = 0;

    console.log(`🔍 Calculating earnings for order ${orderWithUser.orderId}:`, {
      hasRestaurantLocation: !!restaurantLocation,
      restaurantCoords: restaurantLocation?.coordinates,
      hasAddressLocation: !!orderWithUser.address?.location,
      addressCoords: orderWithUser.address?.location?.coordinates,
    });

    if (
      restaurantLocation?.coordinates &&
      orderWithUser.address?.location?.coordinates
    ) {
      const [restaurantLng, restaurantLat] = restaurantLocation.coordinates;
      const [customerLng, customerLat] =
        orderWithUser.address.location.coordinates;

      // Validate coordinates
      if (
        restaurantLat &&
        restaurantLng &&
        customerLat &&
        customerLng &&
        !isNaN(restaurantLat) &&
        !isNaN(restaurantLng) &&
        !isNaN(customerLat) &&
        !isNaN(customerLng)
      ) {
        // Calculate distance using Haversine formula
        const R = 6371; // Earth radius in km
        const dLat = ((customerLat - restaurantLat) * Math.PI) / 180;
        const dLng = ((customerLng - restaurantLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((restaurantLat * Math.PI) / 180) *
            Math.cos((customerLat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        deliveryDistance = R * c;
        console.log(
          `✅ Calculated delivery distance: ${deliveryDistance.toFixed(2)} km`,
        );
      } else {
        console.warn("⚠️ Invalid coordinates for distance calculation");
      }
    } else {
      console.warn("⚠️ Missing coordinates for distance calculation");
    }

    // Calculate estimated earnings based on delivery distance
    let estimatedEarnings = null;
    const deliveryFeeFromOrder = orderWithUser.pricing?.deliveryFee ?? 0;

    try {
      estimatedEarnings = await calculateEstimatedEarnings(deliveryDistance);
      const earnedValue =
        typeof estimatedEarnings === "object"
          ? (estimatedEarnings.totalEarning ?? 0)
          : Number(estimatedEarnings) || 0;

      console.log(`💰 Earnings calculation result:`, {
        estimatedEarnings,
        earnedValue,
        deliveryFeeFromOrder,
        deliveryDistance,
      });

      // Use deliveryFee as fallback if earnings is 0 or invalid
      if (earnedValue <= 0 && deliveryFeeFromOrder > 0) {
        console.log(
          `⚠️ Earnings is 0, using deliveryFee as fallback: ₹${deliveryFeeFromOrder}`,
        );
        estimatedEarnings =
          typeof estimatedEarnings === "object"
            ? { ...estimatedEarnings, totalEarning: deliveryFeeFromOrder }
            : deliveryFeeFromOrder;
      }

      console.log(
        `✅ Final estimated earnings for order ${orderWithUser.orderId}: ₹${typeof estimatedEarnings === "object" ? estimatedEarnings.totalEarning : estimatedEarnings} (distance: ${deliveryDistance.toFixed(2)} km)`,
      );
    } catch (earningsError) {
      console.error(
        "❌ Error calculating estimated earnings in notification:",
        earningsError,
      );
      console.error("❌ Error stack:", earningsError.stack);
      // Fallback to deliveryFee or default
      estimatedEarnings =
        deliveryFeeFromOrder > 0
          ? deliveryFeeFromOrder
          : {
              basePayout: 10,
              distance: deliveryDistance,
              commissionPerKm: 5,
              distanceCommission: 0,
              totalEarning: 10,
              breakdown: "Default calculation",
            };
      console.log(
        `⚠️ Using fallback earnings: ₹${typeof estimatedEarnings === "object" ? estimatedEarnings.totalEarning : estimatedEarnings}`,
      );
    }

    // Prepare notification payload
    const orderNotificationRaw = {
      orderId: orderWithUser.orderId || orderWithUser._id,
      mongoId: orderWithUser._id?.toString(),
      orderMongoId: orderWithUser._id?.toString(),
      status: orderWithUser.status || "preparing",
      restaurantName:
        orderWithUser.restaurantName || orderWithUser.restaurantId?.name,
      restaurantAddress: restaurantAddress,
      restaurantLocation: restaurantLocation
        ? {
            latitude: restaurantLocation.coordinates?.[1],
            longitude: restaurantLocation.coordinates?.[0],
            address:
              restaurantLocation.formattedAddress ||
              restaurantLocation.address ||
              restaurantAddress,
            formattedAddress:
              restaurantLocation.formattedAddress ||
              restaurantLocation.address ||
              restaurantAddress,
          }
        : null,
      customerName: orderWithUser.userId?.name || "Customer",
      customerPhone: orderWithUser.userId?.phone || "",
      deliveryAddress:
        orderWithUser.address?.address ||
        orderWithUser.address?.location?.address ||
        orderWithUser.address?.formattedAddress,
      customerLocation: orderWithUser.address?.location
        ? {
            latitude: orderWithUser.address.location.coordinates?.[1],
            longitude: orderWithUser.address.location.coordinates?.[0],
            address:
              orderWithUser.address.formattedAddress ||
              orderWithUser.address.address,
          }
        : null,
      totalAmount: orderWithUser.pricing?.total || 0,
      items: (orderWithUser.items || []).map((item) => ({
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      deliveryFee: deliveryFeeFromOrder,
      estimatedEarnings: estimatedEarnings,
      deliveryDistance:
        deliveryDistance > 0
          ? `${deliveryDistance.toFixed(2)} km`
          : "Calculating...",
      paymentMethod: orderWithUser.payment?.method || "cash",
      message: `New order available: ${orderWithUser.orderId || orderWithUser._id}`,
      timestamp: new Date().toISOString(),
      phase: phase,
      restaurantLat:
        restaurantLocation?.coordinates?.[1] ||
        orderWithUser.restaurantId?.location?.coordinates?.[1],
      restaurantLng:
        restaurantLocation?.coordinates?.[0] ||
        orderWithUser.restaurantId?.location?.coordinates?.[0],
      deliveryLat:
        orderWithUser.address?.location?.coordinates?.[1] ||
        orderWithUser.address?.location?.latitude,
      deliveryLng:
        orderWithUser.address?.location?.coordinates?.[0] ||
        orderWithUser.address?.location?.longitude,
    };

    // REDACT PII for broad notifications
    const orderNotification = redactPII(orderNotificationRaw);

    console.log(
      `📤 Redacted notification payload for order ${orderWithUser.orderId}`,
    );

    // Notify each delivery partner
    for (const deliveryPartnerId of deliveryPartnerIds) {
      try {
        const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;
        const deliveryPartner =
          deliveryPartnerMap.get(normalizedId) ||
          deliveryPartnerMap.get(deliveryPartnerId?.toString?.());
        const personalizedNotification = await buildAssignmentPayload({
          order: orderWithUser,
          deliveryPartner,
          phase,
          activeAssignedOrderCount: getActiveAssignedOrderCount(deliveryPartner),
          nextDeliveryLocation: deliveryPartner?.route?.[0]
            ? {
                orderId:
                  deliveryPartner.route[0].orderId?.toString?.() ||
                  deliveryPartner.route[0].orderId,
                orderCode: deliveryPartner.route[0].orderCode,
                latitude: deliveryPartner.route[0].latitude,
                longitude: deliveryPartner.route[0].longitude,
                status: deliveryPartner.route[0].status,
                sequence: deliveryPartner.route[0].sequence,
              }
            : null,
        });

        if (!personalizedNotification) {
          console.warn(
            `⚠️ Skipping notification for delivery partner ${normalizedId}: payload incomplete.`,
          );
          continue;
        }
        const roomVariations = [
          `delivery:${normalizedId}`,
          `delivery:${deliveryPartnerId}`,
          ...(mongoose.Types.ObjectId.isValid(normalizedId)
            ? [
                `delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`,
              ]
            : []),
        ];

        let notificationSent = false;
        for (const room of roomVariations) {
          const sockets = await deliveryNamespace.in(room).fetchSockets();
          if (sockets.length > 0) {
            deliveryNamespace
              .to(room)
              .emit("new_order_available", personalizedNotification);
            deliveryNamespace.to(room).emit("play_notification_sound", {
              type: "new_order_available",
              orderId: order.orderId,
              message: `New order available: ${order.orderId}`,
              phase: phase,
            });
            notificationSent = true;
            notifiedCount++;
            console.log(
              `📤 Notified delivery partner ${normalizedId} in room: ${room} (phase: ${phase})`,
            );
            break;
          }
        }

        if (!notificationSent) {
          console.warn(
            `⚠️ Delivery partner ${normalizedId} not connected. Room will receive redacted payload.`,
          );
          roomVariations.forEach((room) => {
            deliveryNamespace
              .to(room)
              .emit(
                "new_order_available",
                redactPII(personalizedNotification),
              );
          });
          notifiedCount++;
        }

        await sendEntityPushNotification(normalizedId, "delivery", {
          title:
            phase === "priority"
              ? "Priority Order Nearby"
              : phase === "expanded"
                ? "More Orders Available"
                : "New Order Available",
          body: `${orderWithUser.restaurantName || "A restaurant"} has order ${orderWithUser.orderId || orderWithUser._id} available`,
          data: {
            type: "delivery_new_order_available",
            orderId: orderWithUser.orderId || orderWithUser._id,
            orderMongoId: orderWithUser._id?.toString(),
            phase,
            status: orderWithUser.status || "preparing",
            restaurantName:
              orderWithUser.restaurantName || orderWithUser.restaurantId?.name || "",
          },
        });
      } catch (partnerError) {
        console.error(
          `❌ Error notifying delivery partner ${deliveryPartnerId}:`,
          partnerError,
        );
      }
    }

    console.log(
      `✅ Notified ${notifiedCount} delivery partners with redacted PII (phase: ${phase}) for order ${order.orderId}`,
    );
    return { success: true, notified: notifiedCount };
  } catch (error) {
    console.error("❌ Error notifying multiple delivery boys:", error);
    return { success: false, notified: 0 };
  }
}

/**
 * Notify delivery boy that order is ready for pickup
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyOrderReady(order, deliveryPartnerId) {
  try {
    const io = await getIOInstance();

    if (!io) {
      console.warn(
        "Socket.IO not initialized, skipping delivery boy notification",
      );
      return;
    }

    const deliveryNamespace = io.of("/delivery");
    const normalizedDeliveryPartnerId =
      deliveryPartnerId?.toString() || deliveryPartnerId;

    // Prepare order ready notification
    const coords = order.restaurantId?.location?.coordinates;
    const orderReadyNotification = {
      orderId: order.orderId || order._id,
      orderMongoId: order._id?.toString(),
      mongoId: order._id?.toString(),
      status: "ready",
      preparationStatus: "ready",
      restaurantName: order.restaurantName || order.restaurantId?.name,
      restaurantAddress:
        order.restaurantId?.address || order.restaurantId?.location?.address,
      restaurantLocation: coords
        ? {
            latitude: coords?.[1],
            longitude: coords?.[0],
            address:
              order.restaurantId?.location?.formattedAddress ||
              order.restaurantId?.location?.address ||
              order.restaurantId?.address ||
              "",
          }
        : null,
      customerName: order.userId?.name || "Customer",
      customerPhone: order.userId?.phone || "",
      customerLocation: order.address?.location
        ? {
            latitude: order.address.location.coordinates?.[1],
            longitude: order.address.location.coordinates?.[0],
            address:
              order.address.formattedAddress ||
              order.address.address ||
              order.deliveryAddress ||
              "",
          }
        : null,
      items: (order.items || []).map((item) => ({
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.pricing?.total || 0,
      totalAmount: order.pricing?.total || 0,
      deliveryFee: order.pricing?.deliveryFee || 0,
      paymentMethod: order.payment?.method || "cash",
      message: `Order ${order.orderId} is ready for pickup`,
      timestamp: new Date().toISOString(),
      // Include restaurant coords so delivery app can show Reached Pickup when rider is near (coordinates: [lng, lat])
      restaurantLat: coords?.[1],
      restaurantLng: coords?.[0],
    };

    // Try to find delivery partner's room
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId)
        ? [
            `delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`,
          ]
        : []),
    ];

    let notificationSent = false;
    let foundRoom = null;
    let socketsInRoom = [];

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        foundRoom = room;
        socketsInRoom = sockets;
        break;
      }
    }

    if (foundRoom && socketsInRoom.length > 0) {
      // Send to specific delivery partner room
      deliveryNamespace
        .to(foundRoom)
        .emit("order_ready", orderReadyNotification);
      notificationSent = true;
      console.log(
        `✅ Order ready notification sent to delivery partner ${normalizedDeliveryPartnerId} in room ${foundRoom}`,
      );
    } else {
      // Do not broadcast assigned order-ready events to all riders.
      console.warn(
        `Delivery partner ${normalizedDeliveryPartnerId} not connected; order_ready socket was not broadcast`,
      );
    }

    await sendEntityPushNotification(normalizedDeliveryPartnerId, "delivery", {
      title: "Order Ready for Pickup",
      body: `Order ${order.orderId || order._id} is ready at ${order.restaurantName || order.restaurantId?.name || "the restaurant"}`,
      data: {
        type: "delivery_order_ready",
        orderId: order.orderId || order._id,
        orderMongoId: order._id?.toString(),
        status: "ready",
        restaurantName: order.restaurantName || order.restaurantId?.name || "",
      },
    });

    return {
      success: notificationSent,
      deliveryPartnerId: normalizedDeliveryPartnerId,
      orderId: order.orderId,
    };
  } catch (error) {
    console.error("Error notifying delivery boy about order ready:", error);
    throw error;
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Calculate estimated earnings for delivery boy based on admin commission rules
 * Uses DeliveryBoyCommission model to calculate: Base Payout + (Distance × Per Km) if distance > minDistance
 */
async function calculateEstimatedEarnings(deliveryDistance) {
  try {
    const DeliveryBoyCommission = (
      await import("../../admin/models/DeliveryBoyCommission.js")
    ).default;

    // Always use calculateCommission method which handles all cases including distance = 0
    // It will return base payout even if distance is 0
    const deliveryDistanceForCalc = deliveryDistance || 0;
    const commissionResult = await DeliveryBoyCommission.calculateCommission(
      deliveryDistanceForCalc,
    );

    // If distance is 0 or not provided, still return base payout
    if (!deliveryDistance || deliveryDistance <= 0) {
      console.log(
        `💰 Distance is 0 or missing, returning base payout only: ₹${commissionResult.breakdown.basePayout}`,
      );
      return {
        basePayout: commissionResult.breakdown.basePayout,
        distance: 0,
        commissionPerKm: commissionResult.breakdown.commissionPerKm,
        distanceCommission: 0,
        totalEarning: commissionResult.breakdown.basePayout, // Base payout only when distance is 0
        breakdown: `Base payout: ₹${commissionResult.breakdown.basePayout}`,
        minDistance: commissionResult.rule.minDistance,
        maxDistance: commissionResult.rule.maxDistance,
      };
    }

    // Use the already calculated commissionResult for distance > 0

    const basePayout = commissionResult.breakdown.basePayout;
    const distance = deliveryDistance;
    const commissionPerKm = commissionResult.breakdown.commissionPerKm;
    const distanceCommission = commissionResult.breakdown.distanceCommission;
    const totalEarning = commissionResult.commission;

    // Create breakdown text
    let breakdown = `Base payout: ₹${basePayout}`;
    if (distance > commissionResult.rule.minDistance) {
      breakdown += ` + Distance (${distance.toFixed(1)} km × ₹${commissionPerKm}/km) = ₹${distanceCommission.toFixed(0)}`;
    } else {
      breakdown += ` (Distance ${distance.toFixed(1)} km ≤ ${commissionResult.rule.minDistance} km, per km not applicable)`;
    }
    breakdown += ` = ₹${totalEarning.toFixed(0)}`;

    return {
      basePayout: Math.round(basePayout * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      commissionPerKm: Math.round(commissionPerKm * 100) / 100,
      distanceCommission: Math.round(distanceCommission * 100) / 100,
      totalEarning: Math.round(totalEarning * 100) / 100,
      breakdown: breakdown,
      minDistance: commissionResult.rule.minDistance,
      maxDistance: commissionResult.rule.maxDistance,
    };
  } catch (error) {
    console.error("Error calculating estimated earnings:", error);
    // Fallback to default calculation
    return {
      basePayout: 10,
      distance: deliveryDistance || 0,
      commissionPerKm: 5,
      distanceCommission:
        deliveryDistance && deliveryDistance > 4 ? deliveryDistance * 5 : 0,
      totalEarning:
        10 +
        (deliveryDistance && deliveryDistance > 4 ? deliveryDistance * 5 : 0),
      breakdown: "Default calculation",
    };
  }
}

