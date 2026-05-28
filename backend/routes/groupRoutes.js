import express from "express";
import { addMember, createGroup, getGroups, removeMember, updateGroup } from "../controllers/groupController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getGroups);
router.post("/", protect, createGroup);
router.patch("/:groupId", protect, updateGroup);
router.post("/:groupId/members", protect, addMember);
router.delete("/:groupId/members/:userId", protect, removeMember);

export default router;
