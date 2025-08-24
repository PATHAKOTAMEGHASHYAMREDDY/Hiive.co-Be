import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { 
  getMessages, 
  getUsersForSidebar, 
  sendMessage,
  sendRoomMessage,
  addReaction,
  replyToMessage,
  pinMessage,
  deleteMessage,
  getReplies
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/:id", protectRoute, getMessages);

router.post("/send/:id", protectRoute, sendMessage);
router.post("/room/:roomId", protectRoute, sendRoomMessage);
router.post("/:messageId/reaction", protectRoute, addReaction);
router.post("/:messageId/reply", protectRoute, replyToMessage);
router.patch("/:messageId/pin", protectRoute, pinMessage);
router.delete("/:messageId", protectRoute, deleteMessage);
router.get("/:messageId/replies", protectRoute, getReplies);

export default router;
