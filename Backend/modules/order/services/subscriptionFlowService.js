import mongoose from "mongoose";
import Order from "../models/Order.js";
import * as walletService from "../../wallet/services/walletService.js";
import { getIO } from "../../../server.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import { findNearestDeliveryBoy, findNearestDeliveryBoys } from "./deliveryAssignmentService.js";

function nowInEditWindow(order) {
  const t = Date.now();
  if (!order.editWindow?.start || !order.editWindow?.end) return false;
  const s = new Date(order.editWindow.start).getTime();
  const e = new Date(order.editWindow.end).getTime();
  return t >= s && t <= e;
}

function computeItemsSubtotal(items) {
  if (!items?.length) return 0;
  return items.reduce((sum, i) => {
    const p = Number(i.price) || 0;
    const q = Number(i.quantity) || 1;
    return sum + p * q;
  }, 0);
}

function primarySelectedMealFromItems(items) {
  if (!items?.length) return {};
  const first = items[0];
  return {
    itemId: String(first.itemId || ""),
    name: String(first.name || ""),
    price: Number(first.price) || 0,
    quantity: Number(first.quantity) || 1,
    image: first.image || "",
    isVeg: first.isVeg !== false,
  };
}

/**
 * POST /api/order/change-meal/:orderId — user only, within editWindow.
 */
export async function changeMealForUser(orderId, userId, { items }) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    const err = new Error("items array required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.userId) !== String(userId)) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
  if (order.source?.type !== "subscription") {
    const err = new Error("Meal change only allowed for subscription orders");
    err.statusCode = 400;
    throw err;
  }
  if (!nowInEditWindow(order)) {
    const err = new Error("Edit window closed");
    err.statusCode = 400;
    throw err;
  }

  const base = order.basePrice != null ? order.basePrice : order.pricing?.total ?? computeItemsSubtotal(order.items);
  const newSubtotal = computeItemsSubtotal(items);
  const delta = newSubtotal - base;

  if (delta > 0) {
    try {
      await walletService.debitWallet(userId, delta, {
        reason: "meal_change",
        orderId: order._id,
        description: `Meal upgrade ₹${delta} for order ${order.orderId}`,
      });
    } catch (e) {
      if (e.code === "INSUFFICIENT_WALLET") {
        const err = new Error("Payment required: insufficient wallet balance");
        err.statusCode = 402;
        err.paymentRequired = true;
        err.amountDue = e.amountDue;
        err.upgradeAmount = delta;
        throw err;
      }
      throw e;
    }
  } else if (delta < 0) {
    await walletService.creditWallet(userId, Math.abs(delta), {
      reason: "meal_change",
      orderId: order._id,
      description: `Meal downgrade credit ₹${Math.abs(delta)} for order ${order.orderId}`,
    });
  }

  order.items = items.map((i) => ({
    itemId: String(i.itemId),
    name: String(i.name),
    price: Number(i.price),
    quantity: Number(i.quantity) || 1,
    image: i.image,
    description: i.description,
    isVeg: i.isVeg !== false,
    selectedVariation: i.selectedVariation,
    subCategory: i.subCategory || "",
  }));

  order.selectedMeal = primarySelectedMealFromItems(order.items);
  order.finalPrice = newSubtotal;
  /** New baseline for any further changes in the same window / auditing. */
  order.basePrice = newSubtotal;
  if (order.pricing) {
    order.pricing.subtotal = newSubtotal;
    order.pricing.total = newSubtotal + (order.pricing.deliveryFee || 0) + (order.pricing.platformFee || 0) + (order.pricing.tax || 0) - (order.pricing.discount || 0);
  }
  order.subscriptionFlowVersion = (order.subscriptionFlowVersion || 0) + 1;
  await order.save();

  return { order, delta, newSubtotal, base };
}

/**
 * PATCH preparation — restaurant must own order.restaurantId
 */
export async function updatePreparationStatus(orderId, restaurantId, { preparationStatus }) {
  const allowed = ["pending", "preparing", "ready"];
  if (!allowed.includes(preparationStatus)) {
    const err = new Error("Invalid preparationStatus");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.restaurantId) !== String(restaurantId)) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  const prev = order.preparationStatus;
  if (prev === preparationStatus) {
    return { order, duplicate: true };
  }

  order.preparationStatus = preparationStatus;
  order.subscriptionFlowVersion = (order.subscriptionFlowVersion || 0) + 1;
  await order.save();

  // When the restaurant marks a subscription order ready, assign the slot batch to N delivery partners:
  // <=5 orders => 1, 6-10 => 2, 11-15 => 3 ... (every 5 orders add 1).
  if (preparationStatus === "ready" && order.source?.type === "subscription" && order.scheduledMealAt) {
    try {
      const center = new Date(order.scheduledMealAt).getTime();
      const lower = new Date(center - 60 * 1000);
      const upper = new Date(center + 60 * 1000);

      const groupOrders = await Order.find({
        restaurantId: order.restaurantId,
        "source.type": "subscription",
        scheduledMealAt: { $gte: lower, $lte: upper },
        status: { $nin: ["cancelled", "skipped", "delivered"] },
      })
        .select("_id userId deliveryBoyId deliveryPartnerId status preparationStatus")
        .lean();

      const uniqueUserCount = new Set(
        groupOrders
          .map((o) => o.userId)
          .filter(Boolean)
          .map((id) => String(id)),
      ).size;

      const totalOrders = groupOrders.length;
      const effectiveOrderCount = uniqueUserCount > 0 ? uniqueUserCount : totalOrders;
      // Rules: <=5 => 1, 6-10 => 2, 11-15 => 3 ... (every 5 orders add 1 delivery partner)
      const desiredDeliveryPartners = Math.max(1, Math.ceil(effectiveOrderCount / 5));

      const existingAssignedIds = Array.from(
        new Set(
          groupOrders
            .map((o) => o.deliveryBoyId || o.deliveryPartnerId)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );

      // Only assign orders that are not assigned yet.
      const unassignedOrders = groupOrders.filter(
        (o) => !(o.deliveryBoyId || o.deliveryPartnerId),
      );

      if (unassignedOrders.length === 0) {
        // Nothing to do (all orders already assigned)
        // Still fall through to ready-notification below.
      } else {
        // Build list of delivery partners to use (keep existing assignments, then top-up).
        const selectedDeliveryPartnerIds = [...existingAssignedIds];

        if (selectedDeliveryPartnerIds.length < desiredDeliveryPartners) {
          const restaurantDoc = await Restaurant.findById(order.restaurantId)
            .select("location")
            .lean();

          const coords = restaurantDoc?.location?.coordinates;
          const lng = Array.isArray(coords) && coords.length >= 2
            ? Number(coords[0])
            : Number(restaurantDoc?.location?.longitude);
          const lat = Array.isArray(coords) && coords.length >= 2
            ? Number(coords[1])
            : Number(restaurantDoc?.location?.latitude);

          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const needed = desiredDeliveryPartners - selectedDeliveryPartnerIds.length;

            // Prefer getting a list, then fallback to single nearest if needed.
            let candidates = [];
            try {
              candidates = await findNearestDeliveryBoys(lat, lng, String(order.restaurantId), 50);
            } catch (_) {
              candidates = [];
            }

            const candidateIds = (candidates || [])
              .map((c) => String(c?._id || ""))
              .filter(Boolean)
              .filter((id) => !selectedDeliveryPartnerIds.includes(id));

            selectedDeliveryPartnerIds.push(...candidateIds.slice(0, needed));

            // Fallback: if list is not enough, ask for nearest repeatedly with exclusions.
            while (selectedDeliveryPartnerIds.length < desiredDeliveryPartners) {
              const nearest = await findNearestDeliveryBoy(
                lat,
                lng,
                String(order.restaurantId),
                50,
                selectedDeliveryPartnerIds,
              );
              if (!nearest?._id) break;
              const id = String(nearest._id);
              if (!selectedDeliveryPartnerIds.includes(id)) {
                selectedDeliveryPartnerIds.push(id);
              } else {
                break;
              }
            }
          }
        }

        // If we still don't have any partner, bail out (non-fatal).
        if (selectedDeliveryPartnerIds.length > 0) {
          // Assign unassigned orders in round-robin across selected partners.
          const partnerObjectIds = selectedDeliveryPartnerIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

          if (partnerObjectIds.length > 0) {
            const bulkOps = [];
            for (let i = 0; i < unassignedOrders.length; i++) {
              const assignedPartner = partnerObjectIds[i % partnerObjectIds.length];
              bulkOps.push({
                updateOne: {
                  filter: { _id: unassignedOrders[i]._id },
                  update: {
                    $set: {
                      deliveryBoyId: assignedPartner,
                      deliveryPartnerId: assignedPartner,
                      status: "assigned",
                    },
                    $inc: { subscriptionFlowVersion: 1 },
                  },
                },
              });
            }
            if (bulkOps.length) {
              await Order.bulkWrite(bulkOps, { ordered: false });
            }

            // If the current order was unassigned, set it locally so notification can be sent.
            const currentWasUnassigned = !(order.deliveryBoyId || order.deliveryPartnerId);
            if (currentWasUnassigned) {
              const index = unassignedOrders.findIndex((o) => String(o._id) === String(order._id));
              if (index !== -1) {
                order.deliveryBoyId = partnerObjectIds[index % partnerObjectIds.length];
                order.deliveryPartnerId = partnerObjectIds[index % partnerObjectIds.length];
              }
            }
          }
        }
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  if (preparationStatus === "ready" && order.deliveryBoyId) {
    try {
      const io = getIO();
      io.of("/delivery").emit("subscription-order-ready", {
        orderId: order._id.toString(),
        orderNumber: order.orderId,
        deliveryBoyId: order.deliveryBoyId.toString(),
        message: "Order ready for pickup",
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  return { order, duplicate: false };
}

/**
 * Admin: assign multiple orders to one delivery partner.
 */
export async function assignOrdersToDeliveryPartner(orderIds, deliveryBoyId) {
  if (!mongoose.Types.ObjectId.isValid(deliveryBoyId)) {
    const err = new Error("Invalid deliveryBoyId");
    err.statusCode = 400;
    throw err;
  }
  const ids = orderIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) {
    const err = new Error("No valid order IDs");
    err.statusCode = 400;
    throw err;
  }
  const result = await Order.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        deliveryBoyId,
        deliveryPartnerId: deliveryBoyId,
        status: "assigned",
      },
      $inc: { subscriptionFlowVersion: 1 },
    },
  );
  return result;
}

const DELIVERY_FLOW = ["assigned", "picked", "delivered"];

/**
 * Delivery app: assigned → picked → delivered (picked only if preparation ready)
 */
export async function updateSubscriptionDeliveryStatus(orderId, deliveryUserId, nextStatus) {
  if (!DELIVERY_FLOW.includes(nextStatus)) {
    const err = new Error("Invalid status");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  const boyId = order.deliveryBoyId || order.deliveryPartnerId;
  if (!boyId || String(boyId) !== String(deliveryUserId)) {
    const err = new Error("Order not assigned to this delivery partner");
    err.statusCode = 403;
    throw err;
  }

  const current = order.status;
  if (nextStatus === "picked") {
    if (current !== "assigned") {
      const err = new Error("Invalid transition: expected status assigned");
      err.statusCode = 409;
      throw err;
    }
    if (order.preparationStatus !== "ready") {
      const err = new Error("Restaurant has not marked order ready");
      err.statusCode = 400;
      throw err;
    }
    order.status = "picked";
  } else if (nextStatus === "delivered") {
    if (current !== "picked" && current !== "out_for_delivery") {
      const err = new Error("Invalid transition: expected picked");
      err.statusCode = 409;
      throw err;
    }
    order.status = "delivered";
    order.deliveredAt = new Date();
  } else if (nextStatus === "assigned") {
    const err = new Error("Use admin assign-orders to set assigned");
    err.statusCode = 400;
    throw err;
  }

  order.subscriptionFlowVersion = (order.subscriptionFlowVersion || 0) + 1;
  await order.save();
  return order;
}
