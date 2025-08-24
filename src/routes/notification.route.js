import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notification.controller.js";

const router = express.Router();

// Add logging middleware for all notification routes
router.use((req, res, next) => {
  console.log(`🔔 Notification route hit: ${req.method} ${req.path}`);
  console.log("📝 Full URL:", req.originalUrl);
  console.log("📝 Query params:", req.query);
  console.log("📝 Body:", req.body);
  next();
});

router.get("/", protectRoute, getNotifications);
router.patch("/:notificationId/read", protectRoute, markAsRead);
router.patch("/read-all", protectRoute, markAllAsRead);
router.delete("/:notificationId", protectRoute, deleteNotification);

export default router;