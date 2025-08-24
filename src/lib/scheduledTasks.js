import cron from 'node-cron';
import Room from '../models/room.model.js';
import User from '../models/user.model.js';
import UserPresence from '../models/userPresence.model.js';
import { io } from './socket.js';

// Auto-unmute users whose mute duration has expired
const autoUnmuteUsers = async () => {
  try {
    const now = new Date();
    
    // Find rooms with muted users whose mute time has expired
    const roomsWithExpiredMutes = await Room.find({
      'members.isMuted': true,
      'members.mutedUntil': { $lte: now }
    });

    for (const room of roomsWithExpiredMutes) {
      let roomUpdated = false;
      
      for (const member of room.members) {
        if (member.isMuted && member.mutedUntil && member.mutedUntil <= now) {
          member.isMuted = false;
          member.mutedUntil = undefined;
          roomUpdated = true;
          

          
          // Emit unmute event to room
          io.to(room._id.toString()).emit('userUnmuted', {
            userId: member.user,
            roomId: room._id,
            automatic: true
          });
        }
      }
      
      if (roomUpdated) {
        await room.save();
      }
    }
  } catch (error) {
    console.error('Error in auto-unmute task:', error);
  }
};

// Clean up stale presence data and mark inactive users as offline
const cleanupPresence = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Mark users as offline if they haven't been active for 5 minutes
    const staleUsers = await UserPresence.find({
      status: { $in: ['online', 'away'] },
      lastActivity: { $lt: fiveMinutesAgo }
    });

    for (const presence of staleUsers) {
      presence.status = 'offline';
      presence.activity = 'idle';
      presence.currentRoom = null;
      presence.socketId = null;
      await presence.save();
      
      // Update user model as well
      await User.findByIdAndUpdate(presence.user, {
        isOnline: false,
        status: 'offline',
        lastSeen: presence.lastActivity
      });
      

    }
    

  } catch (error) {
    console.error('Error in presence cleanup task:', error);
  }
};

// Set users to 'away' status after 5 minutes of inactivity (but still connected)
const updateAwayStatus = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Find users who are online but haven't been active for 5 minutes
    const inactiveUsers = await UserPresence.find({
      status: 'online',
      activity: { $ne: 'typing' }, // Don't mark as away if they're typing
      lastActivity: { $lt: fiveMinutesAgo }
    });

    for (const presence of inactiveUsers) {
      presence.status = 'away';
      await presence.save();
      
      // Update user model
      await User.findByIdAndUpdate(presence.user, {
        status: 'away'
      });
      
      // Emit status change to current room if user is in one
      if (presence.currentRoom) {
        io.to(presence.currentRoom.toString()).emit('userStatusChanged', {
          userId: presence.user,
          status: 'away',
          roomId: presence.currentRoom
        });
      }
      

    }
  } catch (error) {
    console.error('Error in away status update task:', error);
  }
};

// Initialize all scheduled tasks
export const initializeScheduledTasks = () => {
  // Auto-unmute task - runs every minute
  cron.schedule('* * * * *', autoUnmuteUsers, {
    name: 'auto-unmute-users',
    timezone: 'UTC'
  });
  
  // Presence cleanup - runs every 5 minutes
  cron.schedule('*/5 * * * *', cleanupPresence, {
    name: 'cleanup-presence',
    timezone: 'UTC'
  });
  
  // Away status update - runs every minute
  cron.schedule('* * * * *', updateAwayStatus, {
    name: 'update-away-status',
    timezone: 'UTC'
  });
};

// Export individual functions for manual testing
export {
  autoUnmuteUsers,
  cleanupPresence,
  updateAwayStatus
};