import express from "express";
import { 
  createRoom, 
  getRooms, 
  getAvailableRooms,
  joinRoom,
  joinRoomByInvite, 
  leaveRoom, 
  getRoomMessages,
  pinMessage,
  muteUser,
  deleteMessage 
} from "../controllers/room.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", protectRoute, createRoom);
router.get("/", protectRoute, getRooms);
router.get("/available", protectRoute, getAvailableRooms);
router.post("/:roomId/join", protectRoute, joinRoom);
router.post("/join-by-invite", protectRoute, joinRoomByInvite);
router.post("/:roomId/leave", protectRoute, leaveRoom);
router.get("/:roomId/messages", protectRoute, getRoomMessages);
router.post("/:roomId/pin/:messageId", protectRoute, pinMessage);
router.post("/:roomId/mute/:userId", protectRoute, muteUser);
router.delete("/:roomId/message/:messageId", protectRoute, deleteMessage);

export default router;