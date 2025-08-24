import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      role: {
        type: String,
        enum: ['owner', 'moderator', 'member'],
        default: 'member',
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
      isMuted: {
        type: Boolean,
        default: false,
      },
      mutedUntil: {
        type: Date,
      },
    }],
    isPrivate: {
      type: Boolean,
      default: false,
    },
    inviteCode: {
      type: String,
      unique: true,
    },
    maxMembers: {
      type: Number,
      default: 50,
      max: 100,
    },
    tags: [String],
    pinnedMessages: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    }],
    settings: {
      allowFileSharing: {
        type: Boolean,
        default: true,
      },
      allowReactions: {
        type: Boolean,
        default: true,
      },
      allowThreads: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Legacy support for existing data
    mutedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);
export default Room;