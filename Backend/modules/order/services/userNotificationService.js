import { getIO } from "../../../server.js";
import { sendEntityPushNotification } from "./pushNotificationService.js";

const STATUS_MESSAGES = {
  confirmed: "Your order has been confirmed!",
  preparing: "Your order is being prepared.",
  ready: "Your order is ready for pickup!",
  out_for_delivery: "Your order is on the way!",
  delivered: "Your order has been delivered. Enjoy your meal!",
  cancelled: "Your order has been cancelled.",
};

/**
 * Emit an order_status_update event to the user via the default namespace.
 * The user joins room `user:<userId>` on connect.
 */
export function notifyUserOrderStatus(order) {
  try {
    const io = getIO();
    if (!io) return;

    const userId =
      order.userId?._id?.toString() ||
      order.userId?.toString() ||
      null;
    if (!userId) return;

    const status = order.status;
    const message = STATUS_MESSAGES[status] || `Order status updated to ${status}`;

    const payload = {
      orderId: order.orderId || order._id?.toString(),
      status,
      message,
      restaurantName: order.restaurantName || "",
      timestamp: new Date().toISOString(),
    };

    io.to(`user:${userId}`).emit("order_status_update", payload);
    void sendEntityPushNotification(userId, "user", {
      title: "Order Update",
      body: message,
      data: {
        type: "order_status_update",
        orderId: payload.orderId,
        status,
        restaurantName: payload.restaurantName,
      },
    });
  } catch (err) {
    console.error("Error emitting user order status notification:", err);
  }
}

/**
 * Emit an unassigned_order event to the admin namespace (default ns, room "admin").
 */
export function notifyAdminUnassignedOrder(order) {
  try {
    const io = getIO();
    if (!io) return;

    const payload = {
      orderId: order.orderId || order._id?.toString(),
      restaurantName: order.restaurantName || "",
      status: order.status,
      timestamp: new Date().toISOString(),
    };

    io.to("admin").emit("unassigned_order", payload);
  } catch (err) {
    console.error("Error emitting admin unassigned order notification:", err);
  }
}
