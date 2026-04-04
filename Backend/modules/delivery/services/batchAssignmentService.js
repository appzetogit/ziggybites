import mongoose from "mongoose";
import Delivery from "../models/Delivery.js";

let cachedGetIO = null;

async function getIOInstance() {
  if (!cachedGetIO) {
    const serverModule = await import("../../../server.js");
    cachedGetIO = serverModule.getIO;
  }
  return cachedGetIO ? cachedGetIO() : null;
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

function getOrderDestination(order) {
  const coordinates = order?.address?.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return { latitude, longitude };
}

function getDeliveryCurrentLocation(deliveryDoc, fallbackLocation = null) {
  if (
    fallbackLocation &&
    typeof fallbackLocation.latitude === "number" &&
    typeof fallbackLocation.longitude === "number"
  ) {
    return fallbackLocation;
  }

  const coordinates = deliveryDoc?.availability?.currentLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return { latitude, longitude };
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function isActiveAssignedOrder(order) {
  return order && !["delivered", "cancelled"].includes(order.status);
}

function buildAssignedOrderEntry(order, status = "assigned") {
  const destination = getOrderDestination(order);
  if (!destination) return null;

  return {
    orderId: toObjectId(order?._id),
    orderCode: order?.orderId || order?._id?.toString?.() || "",
    latitude: destination.latitude,
    longitude: destination.longitude,
    status,
    assignedAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildOptimizedRoute(currentLocation, assignedOrders = []) {
  const activeOrders = assignedOrders.filter(isActiveAssignedOrder);
  if (!currentLocation || activeOrders.length === 0) {
    return [];
  }

  const remaining = activeOrders.map((order) => ({ ...order }));
  const optimized = [];
  let cursor = { ...currentLocation };

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((order, index) => {
      const distance = calculateDistanceKm(
        cursor.latitude,
        cursor.longitude,
        order.latitude,
        order.longitude,
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const [nextOrder] = remaining.splice(nearestIndex, 1);
    optimized.push({
      orderId: toObjectId(nextOrder.orderId),
      orderCode: nextOrder.orderCode,
      latitude: nextOrder.latitude,
      longitude: nextOrder.longitude,
      status: nextOrder.status,
      sequence: optimized.length + 1,
    });

    cursor = {
      latitude: nextOrder.latitude,
      longitude: nextOrder.longitude,
    };
  }

  return optimized;
}

export async function syncAssignedOrderForDelivery(
  deliveryId,
  order,
  {
    status = "assigned",
    currentLocation = null,
  } = {},
) {
  const deliveryDoc = await Delivery.findById(deliveryId);
  if (!deliveryDoc) return null;

  const nextEntry = buildAssignedOrderEntry(order, status);
  if (!nextEntry) return deliveryDoc;

  const orderObjectId = nextEntry.orderId?.toString();
  const existingIndex = (deliveryDoc.assignedOrders || []).findIndex(
    (assignedOrder) => assignedOrder.orderId?.toString() === orderObjectId,
  );

  if (existingIndex >= 0) {
    const existing = deliveryDoc.assignedOrders[existingIndex];
    deliveryDoc.assignedOrders[existingIndex] = {
      ...(existing.toObject?.() ?? existing),
      ...nextEntry,
      assignedAt: existing.assignedAt || nextEntry.assignedAt,
      updatedAt: new Date(),
    };
  } else {
    if (!Array.isArray(deliveryDoc.assignedOrders)) {
      deliveryDoc.assignedOrders = [];
    }
    deliveryDoc.assignedOrders.push(nextEntry);
  }

  const routeBaseLocation = getDeliveryCurrentLocation(deliveryDoc, currentLocation);
  deliveryDoc.route = buildOptimizedRoute(
    routeBaseLocation,
    deliveryDoc.assignedOrders || [],
  );

  await deliveryDoc.save();
  await emitDeliveryBatchUpdate(deliveryDoc);
  return deliveryDoc;
}

export async function updateAssignedOrderStatusForDelivery(
  deliveryId,
  orderId,
  status,
  currentLocation = null,
) {
  const deliveryDoc = await Delivery.findById(deliveryId);
  if (!deliveryDoc) return null;

  const normalizedOrderId = orderId?.toString();
  deliveryDoc.assignedOrders = (deliveryDoc.assignedOrders || []).map((entry) => {
    if (entry.orderId?.toString() !== normalizedOrderId) {
      return entry;
    }

    return {
      ...(entry.toObject?.() ?? entry),
      status,
      updatedAt: new Date(),
    };
  });

  const routeBaseLocation = getDeliveryCurrentLocation(deliveryDoc, currentLocation);
  deliveryDoc.route = buildOptimizedRoute(
    routeBaseLocation,
    deliveryDoc.assignedOrders || [],
  );

  await deliveryDoc.save();
  await emitDeliveryBatchUpdate(deliveryDoc);
  return deliveryDoc;
}

export async function removeDeliveredOrderFromBatch(
  deliveryId,
  orderId,
  currentLocation = null,
) {
  const deliveryDoc = await Delivery.findById(deliveryId);
  if (!deliveryDoc) return null;

  const normalizedOrderId = orderId?.toString();
  deliveryDoc.assignedOrders = (deliveryDoc.assignedOrders || []).filter(
    (entry) => entry.orderId?.toString() !== normalizedOrderId,
  );

  const routeBaseLocation = getDeliveryCurrentLocation(deliveryDoc, currentLocation);
  deliveryDoc.route = buildOptimizedRoute(
    routeBaseLocation,
    deliveryDoc.assignedOrders || [],
  );

  await deliveryDoc.save();
  await emitDeliveryBatchUpdate(deliveryDoc);
  return deliveryDoc;
}

export async function emitDeliveryBatchUpdate(deliveryDocOrId) {
  const deliveryDoc =
    typeof deliveryDocOrId === "string" || deliveryDocOrId instanceof mongoose.Types.ObjectId
      ? await Delivery.findById(deliveryDocOrId).lean()
      : deliveryDocOrId?.toObject?.() ?? deliveryDocOrId;

  if (!deliveryDoc) return null;

  const io = await getIOInstance();
  if (!io) return null;

  const deliveryNamespace = io.of("/delivery");
  const activeAssignedOrders = (deliveryDoc.assignedOrders || []).filter(isActiveAssignedOrder);
  const nextRouteStop = deliveryDoc.route?.[0] || null;

  const payload = {
    activeAssignedOrderCount: activeAssignedOrders.length,
    assignedOrders: activeAssignedOrders.map((entry) => ({
      orderId: entry.orderId?.toString?.() || entry.orderId,
      orderCode: entry.orderCode,
      latitude: entry.latitude,
      longitude: entry.longitude,
      status: entry.status,
    })),
    route: (deliveryDoc.route || []).map((stop) => ({
      orderId: stop.orderId?.toString?.() || stop.orderId,
      orderCode: stop.orderCode,
      latitude: stop.latitude,
      longitude: stop.longitude,
      status: stop.status,
      sequence: stop.sequence,
    })),
    nextDeliveryLocation: nextRouteStop
      ? {
          orderId: nextRouteStop.orderId?.toString?.() || nextRouteStop.orderId,
          orderCode: nextRouteStop.orderCode,
          latitude: nextRouteStop.latitude,
          longitude: nextRouteStop.longitude,
          status: nextRouteStop.status,
          sequence: nextRouteStop.sequence,
        }
      : null,
  };

  const deliveryId = deliveryDoc._id?.toString?.() || deliveryDoc._id;
  deliveryNamespace.to(`delivery:${deliveryId}`).emit("delivery_batch_update", payload);
  return payload;
}

export function getActiveAssignedOrderCount(deliveryDoc) {
  return (deliveryDoc?.assignedOrders || []).filter(isActiveAssignedOrder).length;
}
