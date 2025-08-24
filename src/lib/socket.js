import { Server } from "socket.io";
import http from "http";
import express from "express";
import User from "../models/user.model.js";
import Room from "../models/room.model.js";
import UserPresence from "../models/userPresence.model.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173", 
      "http://localhost:5174",
      "https://hiiveco.vercel.app",
      process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
  },
});

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

// used to store online users
const userSocketMap = {}; // {userId: socketId}
const typingUsers = {}; // {roomId: [userId1, userId2]}
const roomUsers = {}; // {roomId: [userId1, userId2]} - users currently in each room

// Helper function to get online users in a specific room
function getOnlineUsersInRoom(roomId) {
  return roomUsers[roomId] || [];
}

// Helper function to broadcast online users to room members only
async function broadcastRoomOnlineUsers(roomId) {
  const onlineUsers = getOnlineUsersInRoom(roomId);
  const userDetails = await User.find({ 
    _id: { $in: onlineUsers } 
  }, 'fullName profilePic isOnline lastSeen');
  
  io.to(roomId).emit("roomOnlineUsers", {
    roomId,
    onlineUsers: userDetails
  });
}

io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;
  
  if (userId && userId !== "undefined") {
    userSocketMap[userId] = socket.id;
    
    // Update user online status
    await User.findByIdAndUpdate(userId, { 
      isOnline: true,
      status: 'online',
      lastSeen: new Date() 
    });

    // Update or create user presence
    await UserPresence.findOneAndUpdate(
      { user: userId },
      {
        status: 'online',
        activity: 'viewing',
        socketId: socket.id,
        lastActivity: new Date(),
        lastSeen: new Date()
      },
      { upsert: true, new: true }
    );

    // Broadcast updated online users list to all connected clients
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  }

  // Join user to their rooms
  socket.on("joinRooms", async (roomIds) => {
    roomIds.forEach(roomId => {
      socket.join(roomId);
    });
    
    // Notify room members that user joined
    for (const roomId of roomIds) {
      const room = await Room.findById(roomId).populate("members", "fullName profilePic");
      if (room) {
        socket.to(roomId).emit("userJoinedRoom", {
          userId,
          roomId,
          user: await User.findById(userId, "fullName profilePic")
        });
      }
    }
  });

  // Test socket connection
  socket.on("test", (data) => {
    socket.emit("testResponse", { message: "Socket connection working!", userId });
  });

  // Test room message
  socket.on("testRoomMessage", (data) => {
    const testMessage = {
      _id: "test-" + Date.now(),
      text: data.text,
      senderId: { _id: userId, fullName: "Test User" },
      roomId: data.roomId,
      createdAt: new Date()
    };
    
    // Emit to room
    io.to(data.roomId).emit("newRoomMessage", testMessage);
  });

  // Join specific room
  socket.on("joinRoom", async (roomId) => {
    // Verify user is a member of this room (handle both formats)
    const room = await Room.findById(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    const isMember = room.members.some(member => {
      if (member.user) {
        return member.user.toString() === userId.toString();
      }
      return member.toString() === userId.toString();
    });

    if (!isMember) {
      socket.emit("error", { message: "Access denied to room" });
      return;
    }
    
    socket.join(roomId);
    await User.findByIdAndUpdate(userId, { currentRoom: roomId });
    
    // Update user presence
    await UserPresence.findOneAndUpdate(
      { user: userId },
      {
        currentRoom: roomId,
        activity: 'viewing',
        lastActivity: new Date(),
        activityDetails: {
          roomId: roomId,
          startedAt: new Date()
        }
      }
    );
    
    // Add user to room's online users list
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    if (!roomUsers[roomId].includes(userId)) {
      roomUsers[roomId].push(userId);
    }
    
    const user = await User.findById(userId, "fullName profilePic isOnline lastSeen status");
    
    // Notify other room members that user joined
    socket.to(roomId).emit("userJoinedRoom", {
      userId,
      roomId,
      user
    });
    
    // Send current online users in this room to the joining user
    await broadcastRoomOnlineUsers(roomId);
  });

  // Leave room
  socket.on("leaveRoom", async (roomId) => {
    socket.leave(roomId);
    await User.findByIdAndUpdate(userId, { currentRoom: null });
    
    // Update user presence
    await UserPresence.findOneAndUpdate(
      { user: userId },
      {
        currentRoom: null,
        activity: 'idle',
        lastActivity: new Date(),
        activityDetails: {}
      }
    );
    
    // Remove user from room's online users list
    if (roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(id => id !== userId);
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
      }
    }
    
    const user = await User.findById(userId, "fullName profilePic");
    socket.to(roomId).emit("userLeftRoom", {
      userId,
      roomId,
      user
    });
    
    // Update online users for remaining room members
    await broadcastRoomOnlineUsers(roomId);
  });

  // Handle typing indicators
  socket.on("typing", async (data) => {
    const user = await User.findById(userId, "fullName profilePic");
    
    // Update user presence activity
    await UserPresence.findOneAndUpdate(
      { user: userId },
      {
        activity: data.isTyping ? 'typing' : 'viewing',
        lastActivity: new Date()
      }
    );
    
    if (data.roomId) {
      if (!typingUsers[data.roomId]) {
        typingUsers[data.roomId] = [];
      }
      
      if (data.isTyping) {
        if (!typingUsers[data.roomId].includes(userId)) {
          typingUsers[data.roomId].push(userId);
        }
      } else {
        typingUsers[data.roomId] = typingUsers[data.roomId].filter(id => id !== userId);
      }
      
      socket.to(data.roomId).emit("userTyping", {
        userId,
        user,
        roomId: data.roomId,
        isTyping: data.isTyping,
        typingUsers: typingUsers[data.roomId]
      });
    } else if (data.receiverId) {
      const receiverSocketId = getReceiverSocketId(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userTyping", {
          userId,
          user,
          isTyping: data.isTyping,
        });
      }
    }
  });

  // Handle mentions
  socket.on("mention", (data) => {
    const mentionedUserSocketId = getReceiverSocketId(data.mentionedUserId);
    if (mentionedUserSocketId) {
      io.to(mentionedUserSocketId).emit("mentioned", {
        messageId: data.messageId,
        roomId: data.roomId,
        mentionedBy: data.mentionedBy,
        message: data.message
      });
    }
  });

  socket.on("disconnect", async () => {
    
    if (userId) {
      // Update user offline status
      await User.findByIdAndUpdate(userId, { 
        isOnline: false,
        status: 'offline',
        lastSeen: new Date(),
        currentRoom: null
      });

      // Update user presence
      await UserPresence.findOneAndUpdate(
        { user: userId },
        {
          status: 'offline',
          activity: 'idle',
          currentRoom: null,
          socketId: null,
          lastSeen: new Date(),
          activityDetails: {}
        }
      );
      
      // Remove from typing users
      Object.keys(typingUsers).forEach(roomId => {
        typingUsers[roomId] = typingUsers[roomId]?.filter(id => id !== userId) || [];
      });
      
      // Remove from all room users lists and notify rooms
      Object.keys(roomUsers).forEach(async (roomId) => {
        if (roomUsers[roomId].includes(userId)) {
          roomUsers[roomId] = roomUsers[roomId].filter(id => id !== userId);
          if (roomUsers[roomId].length === 0) {
            delete roomUsers[roomId];
          }
          
          // Notify room members that user went offline
          const user = await User.findById(userId, "fullName profilePic");
          io.to(roomId).emit("userLeftRoom", {
            userId,
            roomId,
            user
          });
          
          // Update online users for room
          await broadcastRoomOnlineUsers(roomId);
        }
      });
      
      delete userSocketMap[userId];
      
      // Broadcast updated online users list to all connected clients
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

export { io, app, server };
