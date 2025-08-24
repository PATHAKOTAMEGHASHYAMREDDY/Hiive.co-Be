import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Room from "../models/room.model.js";
import { createNotification } from "./notification.controller.js";
import { encryptMessage, decryptMessage, encryptFile, decryptFile } from "../lib/encryption.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    
    // Find all rooms where the logged-in user is a member
    const userRooms = await Room.find({
      $or: [
        { members: loggedInUserId }, // Legacy format
        { "members.user": loggedInUserId } // New format
      ]
    }).populate("members.user", "fullName email profilePic")
      .populate("members", "fullName email profilePic"); // Legacy support
    
    // Extract all unique members from these rooms (excluding the logged-in user)
    const roomMembersSet = new Set();
    
    userRooms.forEach(room => {
      // Handle both legacy and new member formats
      if (room.members && room.members.length > 0) {
        room.members.forEach(member => {
          let memberId;
          if (member.user) {
            // New format with role structure
            memberId = member.user._id || member.user;
          } else {
            // Legacy format - direct user reference
            memberId = member._id || member;
          }
          
          if (memberId && memberId.toString() !== loggedInUserId.toString()) {
            roomMembersSet.add(memberId.toString());
          }
        });
      }
    });
    
    // Convert Set to Array and fetch full user details
    const memberIds = Array.from(roomMembersSet);
    const filteredUsers = await User.find({ 
      _id: { $in: memberIds } 
    }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        // Legacy format
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
        // New format (for direct messages, we still use receiverId)
        { sender: myId, receiverId: userToChatId },
        { sender: userToChatId, receiverId: myId },
      ],
      messageType: { $in: ["direct", null, undefined] }, // Include messages without messageType for legacy
    })
    .populate("senderId", "fullName profilePic")
    .populate("sender", "fullName profilePic")
    .populate("mentions", "fullName")
    .populate("reactions.users", "fullName")
    .populate({
      path: "parentMessage",
      select: "text content image file senderId sender createdAt",
      populate: {
        path: "senderId sender",
        select: "fullName profilePic"
      }
    })
    .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {

    const { text, image, parentMessage } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ error: "Message content is required" });
    }

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // Extract mentions from text
    const mentions = [];
    if (text) {
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      let match;
      const mentionedUsernames = [];
      
      while ((match = mentionRegex.exec(text)) !== null) {
        const username = match[1].toLowerCase();
        mentionedUsernames.push(username);
      }
      
      // Find mentioned users
      const users = await User.find({});
      for (const user of users) {
        const userName = user.fullName.toLowerCase().replace(/\s+/g, '');
        if (mentionedUsernames.some(username => 
          userName.includes(username) || username.includes(userName)
        )) {
          mentions.push(user._id);
        }
      }
    }

    const newMessage = new Message({
      sender: senderId, // New field
      senderId, // Legacy field for compatibility
      receiverId,
      content: text, // New field
      text, // Legacy field for compatibility
      image: imageUrl,
      mentions,
      parentMessage,
      messageType: "direct",
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullName profilePic");
    await newMessage.populate("sender", "fullName profilePic");
    await newMessage.populate("mentions", "fullName");

    // Handle parent message replies
    if (parentMessage) {
      await Message.findByIdAndUpdate(parentMessage, {
        $push: { replies: newMessage._id }
      });
    }

    try {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
    } catch (socketError) {
    }

    // Send mention notifications
    if (mentions.length > 0) {
      try {
        const sender = await User.findById(senderId, "fullName profilePic");
        for (const mentionedUserId of mentions) {
          if (mentionedUserId.toString() !== senderId.toString()) {
            await createNotification(
              mentionedUserId,
              "mention",
              "You were mentioned",
              `${sender.fullName} mentioned you in a message`,
              {
                messageId: newMessage._id,
                senderId: senderId,
                senderName: sender.fullName
              }
            );
          }
        }
      } catch (notifError) {
      }
    }

    // Send direct message notification
    if (receiverId !== senderId.toString()) {
      try {
        const sender = await User.findById(senderId, "fullName profilePic");
        await createNotification(
          receiverId,
          "direct_message",
          "New message",
          `${sender.fullName} sent you a message`,
          {
            messageId: newMessage._id,
            senderId: senderId,
            senderName: sender.fullName
          }
        );
      } catch (notifError) {
      }
    }

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

export const sendRoomMessage = async (req, res) => {
  try {
    const { text, image, file, replyTo } = req.body;
    const { roomId } = req.params;
    const senderId = req.user._id;

    const room = await Room.findById(roomId)
      .populate("members", "fullName email")
      .populate("members.user", "fullName email");
    
    if (!room) {
      return res.status(403).json({ error: "Room not found" });
    }

    // Check if user is a member (handle both formats)
    const isMember = room.members.some(member => {
      if (member.user) {
        return member.user._id.toString() === senderId.toString();
      }
      return member._id.toString() === senderId.toString();
    });

    if (!isMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if user is muted (handle both legacy and new formats)
    const isMuted = room.mutedUsers?.includes(senderId) || 
                   room.members.some(member => {
                     if (member.user) {
                       return member.user.toString() === senderId.toString() && member.isMuted;
                     }
                     return false;
                   });

    if (isMuted) {
      return res.status(403).json({ error: "You are muted in this room" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    let fileUrl;
    if (file) {
      const uploadResponse = await cloudinary.uploader.upload(file.data, {
        resource_type: "auto",
      });
      fileUrl = {
        url: uploadResponse.secure_url,
        name: file.name,
        type: file.type,
        size: file.size,
      };
    }

    // Extract mentions from text - improved regex
    const mentions = [];
    if (text) {
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      let match;
      const mentionedUsernames = [];
      
      while ((match = mentionRegex.exec(text)) !== null) {
        const username = match[1].toLowerCase();
        mentionedUsernames.push(username);
      }
      
      // Find mentioned users in room members (handle both formats)
      for (const member of room.members) {
        let memberData;
        if (member.user) {
          memberData = member.user; // New format
        } else {
          memberData = member; // Legacy format
        }
        
        if (memberData.fullName) {
          const memberName = memberData.fullName.toLowerCase().replace(/\s+/g, '');
          if (mentionedUsernames.some(username => 
            memberName.includes(username) || username.includes(memberName)
          )) {
            mentions.push(memberData._id);
          }
        }
      }
    }

    const newMessage = new Message({
      sender: senderId, // New field
      senderId, // Legacy field for compatibility
      studyRoom: roomId, // New field
      roomId, // Legacy field for compatibility
      content: text, // New field
      text, // Legacy field for compatibility
      image: imageUrl,
      file: fileUrl,
      messageType: "room",
      mentions,
      replyTo: replyTo || undefined, // Use undefined instead of null
    });
    
    await newMessage.save();
    await newMessage.populate("senderId", "fullName email profilePic");
    await newMessage.populate("sender", "fullName email profilePic");
    await newMessage.populate("mentions", "fullName email");
    
    // Always populate replyTo if it exists
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select: "text image file senderId createdAt isDeleted",
        populate: {
          path: "senderId",
          select: "fullName profilePic"
        }
      });
    }

    // Emit to all room members
    const messageToEmit = {
      ...newMessage.toObject(),
      roomId,
    };
    
    // Emit to the room (all users who joined this room)
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const socketCount = roomSockets ? roomSockets.size : 0;
    
    if (socketCount > 0) {
      // Use room-based emission (preferred method)
      io.to(roomId).emit("newRoomMessage", messageToEmit);
    } else {
      // Fallback to individual emission only if no room sockets
      let successfulEmissions = 0;
      room.members.forEach(member => {
        let memberId, memberName;
        if (member.user) {
          memberId = member.user._id.toString();
          memberName = member.user.fullName;
        } else {
          memberId = member._id.toString();
          memberName = member.fullName;
        }
        
        const memberSocketId = getReceiverSocketId(memberId);
        if (memberSocketId) {
          io.to(memberSocketId).emit("newRoomMessage", messageToEmit);
          successfulEmissions++;
        }
      });
    }

    // Send mention notifications
    if (mentions.length > 0) {
      const sender = await User.findById(senderId, "fullName profilePic");
      mentions.forEach(async (mentionedUserId) => {
        if (mentionedUserId.toString() !== senderId.toString()) {
          // Create notification
          await createNotification(
            mentionedUserId,
            "mention",
            "You were mentioned",
            `${sender.fullName} mentioned you in ${room.name}`,
            {
              messageId: newMessage._id,
              roomId: roomId,
              senderId: senderId,
              roomName: room.name,
              senderName: sender.fullName
            }
          );

          // Send real-time mention event
          const mentionedUserSocketId = getReceiverSocketId(mentionedUserId.toString());
          if (mentionedUserSocketId) {
            io.to(mentionedUserSocketId).emit("mentioned", {
              messageId: newMessage._id,
              roomId,
              roomName: room.name,
              mentionedBy: sender,
              message: text,
              timestamp: newMessage.createdAt
            });
          }
        }
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const existingReaction = message.reactions.find(r => r.emoji === emoji);
    
    if (existingReaction) {
      const userIndex = existingReaction.users.indexOf(userId);
      if (userIndex > -1) {
        existingReaction.users.splice(userIndex, 1);
        if (existingReaction.users.length === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existingReaction.users.push(userId);
      }
    } else {
      message.reactions.push({
        emoji,
        users: [userId],
      });
    }

    await message.save();
    await message.populate("reactions.users", "fullName email");

    // Emit reaction update
    if (message.messageType === "room") {
      const room = await Room.findById(message.roomId);
      room.members.forEach(memberId => {
        const memberSocketId = getReceiverSocketId(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit("reactionUpdate", {
            messageId,
            reactions: message.reactions,
          });
        }
      });
    } else {
      const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("reactionUpdate", {
          messageId,
          reactions: message.reactions,
        });
      }
    }

    res.status(200).json(message.reactions);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const replyToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text, image } = req.body;
    const senderId = req.user._id;

    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
      return res.status(404).json({ error: "Parent message not found" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const replyMessage = new Message({
      senderId,
      receiverId: parentMessage.receiverId,
      roomId: parentMessage.roomId,
      text,
      image: imageUrl,
      messageType: parentMessage.messageType,
      parentMessage: messageId,
    });

    await replyMessage.save();
    await replyMessage.populate("senderId", "fullName email profilePic");

    // Add reply to parent message
    parentMessage.replies.push(replyMessage._id);
    await parentMessage.save();

    // Emit reply
    if (parentMessage.messageType === "room") {
      const room = await Room.findById(parentMessage.roomId);
      room.members.forEach(memberId => {
        const memberSocketId = getReceiverSocketId(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit("newReply", {
            parentMessageId: messageId,
            reply: replyMessage,
          });
        }
      });
    } else {
      const receiverSocketId = getReceiverSocketId(parentMessage.receiverId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newReply", {
          parentMessageId: messageId,
          reply: replyMessage,
        });
      }
    }

    res.status(201).json(replyMessage);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user has permission to pin (room owner or admin)
    if (message.messageType === "room") {
      const room = await Room.findById(message.roomId);
      if (room.owner.toString() !== userId.toString()) {
        return res.status(403).json({ error: "Only room owner can pin messages" });
      }
    } else {
      // For direct messages, only sender or receiver can pin
      if (message.senderId.toString() !== userId.toString() && 
          message.receiverId.toString() !== userId.toString()) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    message.isPinned = !message.isPinned;
    await message.save();

    // Emit pin update
    if (message.messageType === "room") {
      const room = await Room.findById(message.roomId);
      room.members.forEach(memberId => {
        const memberSocketId = getReceiverSocketId(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit("messagePinned", {
            messageId,
            isPinned: message.isPinned,
          });
        }
      });
    } else {
      const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messagePinned", {
          messageId,
          isPinned: message.isPinned,
        });
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagePinned", {
          messageId,
          isPinned: message.isPinned,
        });
      }
    }

    res.status(200).json({ isPinned: message.isPinned });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Check if user has permission to delete
    let canDelete = false;
    
    if (message.messageType === "room") {
      const room = await Room.findById(message.roomId);
      // Room owner or message sender can delete
      canDelete = room.owner.toString() === userId.toString() || 
                  message.senderId.toString() === userId.toString();
    } else {
      // Message sender can delete their own message
      canDelete = message.senderId.toString() === userId.toString();
    }

    if (!canDelete) {
      return res.status(403).json({ error: "Access denied" });
    }

    message.isDeleted = true;
    message.text = "This message was deleted";
    message.image = null;
    message.file = null;
    await message.save();

    // Emit delete update
    if (message.messageType === "room") {
      const room = await Room.findById(message.roomId);
      room.members.forEach(memberId => {
        const memberSocketId = getReceiverSocketId(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit("messageDeleted", {
            messageId,
            text: message.text,
          });
        }
      });
    } else {
      const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageDeleted", {
          messageId,
          text: message.text,
        });
      }
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageDeleted", {
          messageId,
          text: message.text,
        });
      }
    }

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getReplies = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const replies = await Message.find({ parentMessage: messageId })
      .populate("senderId", "fullName profilePic")
      .populate("mentions", "fullName")
      .sort({ createdAt: 1 });

    res.status(200).json(replies);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};