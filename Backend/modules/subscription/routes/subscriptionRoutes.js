import express from "express";
import {
  getPlans,
  getActiveSubscriptions,
  createSubscription,
  updateSubscriptionItems,
  initSubscriptionMealAddPayment,
  confirmSubscriptionMealAddPayment,
  createPlanOrder,
  verifyPlanPayment,
  getPurchasedPlans,
  getPlanDashboard,
  toggleAutoPay,
  cancelSubscription,
  setAutoPayMandate,
  calculatePlanPrice,
  pauseMealSubscription,
  resumeMealSubscription,
  getPauseEstimate,
} from "../controllers/subscriptionController.js";
import { getSubscriptionSettings } from "../controllers/subscriptionSettingsController.js";
import { authenticate } from "../../auth/middleware/auth.js";

const router = express.Router();

router.get("/plans", getPlans);
router.get("/settings", getSubscriptionSettings);
router.post("/calculate-plan-price", calculatePlanPrice);
router.get("/active", authenticate, getActiveSubscriptions);
router.get("/pause-estimate", authenticate, getPauseEstimate);
router.get("/purchased-plans", authenticate, getPurchasedPlans);
router.get("/dashboard", authenticate, getPlanDashboard);
router.post("/", authenticate, createSubscription);
router.post("/:id/items/init-add-payment", authenticate, initSubscriptionMealAddPayment);
router.post("/:id/items/confirm-add-payment", authenticate, confirmSubscriptionMealAddPayment);
router.patch("/:id/items", authenticate, updateSubscriptionItems);
router.post("/create-plan-order", authenticate, createPlanOrder);
router.post("/verify-plan-payment", authenticate, verifyPlanPayment);
router.post("/toggle-autopay", authenticate, toggleAutoPay);
router.post("/cancel", authenticate, cancelSubscription);
router.post("/pause", authenticate, pauseMealSubscription);
router.post("/resume", authenticate, resumeMealSubscription);
router.post("/set-autopay-mandate", authenticate, setAutoPayMandate);

export default router;
