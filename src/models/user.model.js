import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      minlength: 3,
      maxlength: 30,
      sparse: true, // Allow null values but ensure uniqueness when present
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    currentRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    studyRooms: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    }],
    isTyping: {
      type: Boolean,
      default: false,
    },
    pushNotificationsEnabled: {
      type: Boolean,
      default: true,
    },
    pushSubscription: {
      endpoint: String,
      keys: {
        p256dh: String,
        auth: String,
      },
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
