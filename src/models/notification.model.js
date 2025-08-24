import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: [
        "mention", 
        "reply", 
        "reaction", 
        "room_invite", 
        "user_promoted", 
        "user_muted", 
        "user_kicked",
        "room_join", 
        "room_leave", 
        "message_pin", 
        "direct_message"
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Room",
      },
      roomName: String,
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      emoji: String, // for reactions
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // Legacy support
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;