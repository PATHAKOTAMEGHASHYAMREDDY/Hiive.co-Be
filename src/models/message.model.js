import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      maxlength: 2000,
    },
    encryptedContent: {
      encryptedData: String,
      iv: String,
      algorithm: String,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    studyRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    messageType: {
      type: String,
      enum: ['text', 'file', 'image', 'system', 'direct', 'room'],
      default: 'text',
    },
    file: {
      originalName: String,
      mimetype: String,
      size: Number,
      cloudinaryUrl: String,
      cloudinaryPublicId: String,
      encryptionMetadata: {
        iv: String,
        algorithm: String,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    reactions: [{
      emoji: String,
      users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
    }],
    parentMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    replies: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    }],
    isPinned: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    systemMessage: {
      type: String,
      enum: ['user_joined', 'user_left', 'room_created', 'user_promoted', 'user_demoted'],
    },
    // Legacy support for existing data
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    text: String,
    image: String,
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true }
);

// Add validation to ensure either sender or senderId is present
messageSchema.pre('save', function(next) {
  if (!this.sender && !this.senderId) {
    return next(new Error('Either sender or senderId must be provided'));
  }
  
  // If sender is provided but senderId is not, copy sender to senderId for compatibility
  if (this.sender && !this.senderId) {
    this.senderId = this.sender;
  }
  
  // If senderId is provided but sender is not, copy senderId to sender
  if (this.senderId && !this.sender) {
    this.sender = this.senderId;
  }
  
  next();
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
