import mongoose from "mongoose";

const userPresenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    activity: {
      type: String,
      enum: ['idle', 'viewing', 'typing'],
      default: 'idle',
    },
    currentRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    socketId: String,
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    activityDetails: {
      roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Room",
      },
      startedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  { timestamps: true }
);

// Index for efficient queries
userPresenceSchema.index({ user: 1 });
userPresenceSchema.index({ currentRoom: 1 });
userPresenceSchema.index({ status: 1 });

const UserPresence = mongoose.model("UserPresence", userPresenceSchema);

export default UserPresence;