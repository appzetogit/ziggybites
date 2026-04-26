import express from "express";
import {
  createOrder,
  verifyOrderPayment,
  getUserOrders,
  getOrderDetails,
  calculateOrder,
  cancelOrder,
  updateOrderDeliveryDetails,
  submitOrderReview,
} from "../controllers/orderController.js";
import { changeMeal } from "../controllers/subscriptionFlowController.js";
import {
  getOrderChat,
  sendOrderChatMessage,
} from "../controllers/orderChatController.js";
import { authenticate } from "../../auth/middleware/auth.js";

const router = express.Router();

// Calculate order pricing (public endpoint - no auth required for cart preview)
// This must be before the authenticate middleware
router.post("/calculate", calculateOrder);

// All other routes require authentication
router.use(authenticate);

// Subscription meal change (must be before /:id routes)
router.post("/change-meal/:orderId", changeMeal);

// Create order and initiate payment
router.post("/", createOrder);

// Verify payment
router.post("/verify-payment", verifyOrderPayment);

// Get user orders
router.get("/", getUserOrders);

// Order chat (must be before /:id to avoid "chat" as id)
router.get("/:orderId/chat", getOrderChat);
router.post("/:orderId/chat/messages", sendOrderChatMessage);

// Get order details
router.get("/:id", getOrderDetails);

// Cancel order
router.patch("/:id/cancel", cancelOrder);

// Update delivery details
router.put("/:id/update-delivery-details", updateOrderDeliveryDetails);

// Submit order review
router.patch("/:id/review", submitOrderReview);

export default router;
