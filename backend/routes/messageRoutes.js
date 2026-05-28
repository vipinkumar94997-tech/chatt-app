import express from "express";
import { getDirectMessages, getGroupMessages, markRead } from "../controllers/messageController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/direct/:userId", protect, getDirectMessages);
router.get("/group/:groupId", protect, getGroupMessages);
router.post("/read", protect, markRead);

export default router;
