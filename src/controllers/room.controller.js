import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { generateInviteCode } from "../lib/encryption.js";
import { io } from "../lib/socket.js";

export const createRoom = async (req, res) => {
  try {
    const { name, description, isPrivate, tags, maxMembers } = req.body;
    const userId = req.user._id;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Room name is required" });
    }

    if (name.length > 50) {
      return res.status(400).json({ message: "Room name must be 50 characters or less" });
    }

    // Generate unique invite code
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const existingRoom = await Room.findOne({ inviteCode });
      if (!existingRoom) {
        isUnique = true;
      }
    }

    const newRoom = new Room({
      name: name.trim(),
      description: description?.trim() || "",
      owner: userId,
      members: [{
        user: userId,
        role: 'owner',
        joinedAt: new Date()
      }],
      isPrivate: isPrivate || false,
      inviteCode,
      tags: tags || [],
      maxMembers: Math.min(maxMembers || 50, 100),
      settings: {
        allowFileSharing: true,
        allowReactions: true,
        allowThreads: true
      }
    });

    await newRoom.save();
    
    // Update user's studyRooms array
    await User.findByIdAndUpdate(userId, {
      $addToSet: { studyRooms: newRoom._id }
    });

    await newRoom.populate("owner", "fullName email profilePic");
    await newRoom.populate("members.user", "fullName email profilePic");

    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const rooms = await Room.find({
      $or: [
        { members: userId }, // Legacy format
        { "members.user": userId } // New format
      ]
    })
    .populate("owner", "fullName email profilePic")
    .populate("members.user", "fullName email profilePic")
    .populate("members", "fullName email profilePic") // Legacy support
    .sort({ updatedAt: -1 });

    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAvailableRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get rooms that user is NOT a member of and are not private
    const availableRooms = await Room.find({
      $and: [
        {
          $nor: [
            { members: userId }, // Legacy format
            { "members.user": userId } // New format
          ]
        },
        { isPrivate: false },
        { $or: [{ isActive: { $ne: false } }, { isActive: { $exists: false } }] } // Only active rooms or rooms without isActive field
      ]
    })
    .populate("owner", "fullName email profilePic")
    .populate("members.user", "fullName email profilePic")
    .populate("members", "fullName email profilePic") // Legacy support
    .sort({ createdAt: -1 });

    res.status(200).json(availableRooms);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const joinRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.isActive === false) {
      return res.status(403).json({ message: "Room is not active" });
    }

    // Check if room is at capacity
    const currentMemberCount = room.members.length;
    if (currentMemberCount >= room.maxMembers) {
      return res.status(403).json({ message: "Room is at maximum capacity" });
    }

    // Check if user is already a member (handle both formats)
    const isAlreadyMember = room.members.some(member => {
      if (member.user) {
        return member.user.toString() === userId.toString();
      }
      return member.toString() === userId.toString();
    });

    if (!isAlreadyMember) {
      // Add user with new format
      room.members.push({
        user: userId,
        role: 'member',
        joinedAt: new Date()
      });
      await room.save();

      // Update user's studyRooms array
      await User.findByIdAndUpdate(userId, {
        $addToSet: { studyRooms: roomId }
      });

      // Create system message
      const systemMessage = new Message({
        sender: userId,
        studyRoom: roomId,
        messageType: 'system',
        systemMessage: 'user_joined',
        content: `joined the room`
      });
      await systemMessage.save();

      // Emit to room members
      io.to(roomId).emit("userJoinedRoom", {
        userId,
        roomId,
        user: await User.findById(userId, "fullName profilePic"),
        systemMessage
      });
    }

    await room.populate("owner", "fullName email profilePic");
    await room.populate("members.user", "fullName email profilePic");

    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const joinRoomByInvite = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user._id;

    if (!inviteCode) {
      return res.status(400).json({ message: "Invite code is required" });
    }

    const room = await Room.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!room) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (room.isActive === false) {
      return res.status(403).json({ message: "Room is not active" });
    }

    // Check if room is at capacity
    const currentMemberCount = room.members.length;
    if (currentMemberCount >= room.maxMembers) {
      return res.status(403).json({ message: "Room is at maximum capacity" });
    }

    // Check if user is already a member
    const isAlreadyMember = room.members.some(member => {
      if (member.user) {
        return member.user.toString() === userId.toString();
      }
      return member.toString() === userId.toString();
    });

    if (isAlreadyMember) {
      return res.status(400).json({ message: "You are already a member of this room" });
    }

    // Add user to room
    room.members.push({
      user: userId,
      role: 'member',
      joinedAt: new Date()
    });
    await room.save();

    // Update user's studyRooms array
    await User.findByIdAndUpdate(userId, {
      $addToSet: { studyRooms: room._id }
    });

    // Create system message
    const systemMessage = new Message({
      sender: userId,
      studyRoom: room._id,
      messageType: 'system',
      systemMessage: 'user_joined',
      content: `joined the room via invite`
    });
    await systemMessage.save();

    // Emit to room members
    io.to(room._id.toString()).emit("userJoinedRoom", {
      userId,
      roomId: room._id,
      user: await User.findById(userId, "fullName profilePic"),
      systemMessage
    });

    await room.populate("owner", "fullName email profilePic");
    await room.populate("members.user", "fullName email profilePic");

    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Handle both legacy and new member formats
    room.members = room.members.filter(member => {
      if (member.user) {
        return member.user.toString() !== userId.toString();
      }
      return member.toString() !== userId.toString();
    });
    
    await room.save();

    // Remove from user's studyRooms array
    await User.findByIdAndUpdate(userId, {
      $pull: { studyRooms: roomId }
    });

    // Create system message
    const systemMessage = new Message({
      sender: userId,
      studyRoom: roomId,
      messageType: 'system',
      systemMessage: 'user_left',
      content: `left the room`
    });
    await systemMessage.save();

    // Emit to room members
    io.to(roomId).emit("userLeftRoom", {
      userId,
      roomId,
      user: await User.findById(userId, "fullName profilePic"),
      systemMessage
    });

    res.status(200).json({ message: "Left room successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(403).json({ message: "Room not found" });
    }

    // Check if user is a member (handle both formats)
    const isMember = room.members.some(member => {
      if (member.user) {
        return member.user.toString() === userId.toString();
      }
      return member.toString() === userId.toString();
    });

    if (!isMember) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Use both legacy and new field names for compatibility
    const messages = await Message.find({
      $or: [
        { roomId: roomId }, // Legacy field
        { studyRoom: roomId } // New field
      ],
      isDeleted: { $ne: true },
    })
    .populate("senderId", "fullName email profilePic") // Legacy field
    .populate("sender", "fullName email profilePic") // New field
    .populate("mentions", "fullName email")
    .populate("reactions.users", "fullName email")
    .populate({
      path: "replyTo",
      select: "text content image file senderId sender createdAt",
      populate: {
        path: "senderId sender",
        select: "fullName profilePic"
      }
    })
    .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const pinMessage = async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    if (!room || !room.owner.equals(userId)) {
      return res.status(403).json({ message: "Only room owner can pin messages" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.isPinned = !message.isPinned;
    await message.save();

    if (message.isPinned) {
      if (!room.pinnedMessages.includes(messageId)) {
        room.pinnedMessages.push(messageId);
      }
    } else {
      room.pinnedMessages = room.pinnedMessages.filter(id => !id.equals(messageId));
    }
    
    await room.save();

    res.status(200).json({ message: "Message pin status updated", isPinned: message.isPinned });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const muteUser = async (req, res) => {
  try {
    const { roomId, userId: targetUserId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    if (!room || !room.owner.equals(userId)) {
      return res.status(403).json({ message: "Only room owner can mute users" });
    }

    const isMuted = room.mutedUsers.includes(targetUserId);
    
    if (isMuted) {
      room.mutedUsers = room.mutedUsers.filter(id => !id.equals(targetUserId));
    } else {
      room.mutedUsers.push(targetUserId);
    }
    
    await room.save();

    res.status(200).json({ 
      message: isMuted ? "User unmuted" : "User muted", 
      isMuted: !isMuted 
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    const message = await Message.findById(messageId);

    if (!room || !message) {
      return res.status(404).json({ message: "Room or message not found" });
    }

    // Only room owner or message sender can delete
    if (!room.owner.equals(userId) && !message.senderId.equals(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    message.isDeleted = true;
    await message.save();

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};