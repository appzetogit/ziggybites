import express from 'express';
import {
  getRestaurantOrders,
  getRestaurantOrderById,
  acceptOrder,
  rejectOrder,
  markOrderPreparing,
  markOrderReady
} from '../controllers/restaurantOrderController.js';
import { resendDeliveryNotification } from '../controllers/resendDeliveryNotification.js';
import {
  getRestaurantReviews,
  getReviewByOrderId
} from '../controllers/reviewController.js';
import { authenticate } from '../middleware/restaurantAuth.js';
import { patchSubscriptionPreparationStatus } from '../controllers/restaurantSubscriptionFlowController.js';

const router = express.Router();

// Order routes - each route requires restaurant authentication
router.get('/orders', authenticate, getRestaurantOrders);
/** Subscription flow: preparationStatus pending | preparing | ready (additive API). */
router.patch(
  '/orders/:orderId/preparation-status',
  authenticate,
  patchSubscriptionPreparationStatus,
);
router.get('/orders/:id', authenticate, getRestaurantOrderById);
router.patch('/orders/:id/accept', authenticate, acceptOrder);
router.patch('/orders/:id/reject', authenticate, rejectOrder);
router.patch('/orders/:id/preparing', authenticate, markOrderPreparing);
router.patch('/orders/:id/ready', authenticate, markOrderReady);
router.post('/orders/:id/resend-delivery-notification', authenticate, resendDeliveryNotification);

// Review routes
router.get('/reviews', authenticate, getRestaurantReviews);
router.get('/reviews/:orderId', authenticate, getReviewByOrderId);

// Complaint routes - will be imported and used in restaurant index
export default router;

