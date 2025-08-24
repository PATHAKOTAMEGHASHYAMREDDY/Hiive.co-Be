import Notification from "../models/notification.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    const notification = new Notification({
      recipient: userId, // Use new field name
      userId, // Keep legacy field for compatibility
      type,
      title,
      message,
      data,
    });

    await notification.save();
    await notification.populate("sender", "fullName profilePic");

    // Send real-time notification
    const userSocketId = getReceiverSocketId(userId.toString());
    if (userSocketId) {
      io.to(userSocketId).emit("newNotification", notification);
    }

    return notification;
  } catch (error) {
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const notifications = await Notification.find({
      $or: [
        { userId }, // Legacy field
        { recipient: userId } // New field
      ],
      isDeleted: { $ne: true },
    })
      .populate("sender", "fullName profilePic")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const unreadCount = await Notification.countDocuments({
      $or: [
        { userId }, // Legacy field
        { recipient: userId } // New field
      ],
      isRead: false,
      isDeleted: { $ne: true },
    });

    const totalCount = await Notification.countDocuments({
      $or: [
        { userId }, // Legacy field
        { recipient: userId } // New field
      ],
      isDeleted: { $ne: true }
    });

    res.status(200).json({
      notifications,
      unreadCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    await Notification.findOneAndUpdate(
      { 
        _id: notificationId, 
        $or: [
          { userId }, // Legacy field
          { recipient: userId } // New field
        ]
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    console.log("🚀 markAllAsRead endpoint hit!");
    console.log("📝 Request method:", req.method);
    console.log("📝 Request URL:", req.url);
    console.log("📝 Request headers:", req.headers);
    
    const userId = req.user._id;
    console.log("📝 markAllAsRead called for user:", userId);

    // First, let's check if there are any unread notifications
    const unreadCount = await Notification.countDocuments({
      $or: [
        { userId }, // Legacy field
        { recipient: userId } // New field
      ],
      isRead: false 
    });

    console.log("📊 Found unread notifications:", unreadCount);

    const result = await Notification.updateMany(
      { 
        $or: [
          { userId }, // Legacy field
          { recipient: userId } // New field
        ],
        isRead: false 
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    console.log("📊 Update result:", result);

    const responseData = { 
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
      unreadCountBefore: unreadCount,
      userId: userId.toString()
    };

    console.log("📤 Sending response:", responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ Error in markAllAsRead:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    await Notification.findOneAndUpdate(
      { 
        _id: notificationId, 
        $or: [
          { userId }, // Legacy field
          { recipient: userId } // New field
        ]
      },
      { isDeleted: true }
    );

    res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};