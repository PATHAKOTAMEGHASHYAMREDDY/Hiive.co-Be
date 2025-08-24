import Room from '../models/room.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';

// Migration function to convert legacy room members to new format
export const migrateRoomMembers = async () => {
  try {
    
    const rooms = await Room.find({});
    let migratedCount = 0;
    
    for (const room of rooms) {
      let needsUpdate = false;
      const newMembers = [];
      
      for (const member of room.members) {
        if (!member.user && !member.role) {
          // This is a legacy member (just ObjectId)
          newMembers.push({
            user: member,
            role: room.owner.equals(member) ? 'owner' : 'member',
            joinedAt: room.createdAt || new Date(),
            isMuted: false
          });
          needsUpdate = true;
        } else {
          // This is already in new format
          newMembers.push(member);
        }
      }
      
      if (needsUpdate) {
        room.members = newMembers;
        
        // Ensure isActive field exists
        if (room.isActive === undefined) {
          room.isActive = true;
        }
        
        // Ensure settings exist
        if (!room.settings) {
          room.settings = {
            allowFileSharing: true,
            allowReactions: true,
            allowThreads: true
          };
        }
        
        await room.save();
        migratedCount++;
      }
    }
  } catch (error) {
  }
};

// Migration function to add missing user fields
export const migrateUserFields = async () => {
  try {
    
    const users = await User.find({});
    let migratedCount = 0;
    
    for (const user of users) {
      let needsUpdate = false;
      
      if (!user.status) {
        user.status = user.isOnline ? 'online' : 'offline';
        needsUpdate = true;
      }
      
      if (!user.studyRooms) {
        user.studyRooms = [];
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await user.save();
        migratedCount++;
      }
    }
  } catch (error) {
  }
};

// Run all migrations
export const runMigrations = async () => {
  await migrateUserFields();
  await migrateRoomMembers();
};