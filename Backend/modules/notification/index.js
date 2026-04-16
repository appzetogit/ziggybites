import express from "express";
import { authenticateAdmin } from "../admin/middleware/adminAuth.js";
import { authenticateNotificationRecipient } from "./middleware/notificationAuth.js";
import {
  getAdminNotificationHistory,
  getMyNotifications,
  markNotificationAsRead,
  sendAdminNotification,
} from "./controllers/notificationController.js";

const router = express.Router();

router.get("/", authenticateNotificationRecipient, getMyNotifications);
router.patch("/:id/read", authenticateNotificationRecipient, markNotificationAsRead);

router.get("/admin/history", authenticateAdmin, getAdminNotificationHistory);
router.post("/admin/send", authenticateAdmin, sendAdminNotification);

export default router;
