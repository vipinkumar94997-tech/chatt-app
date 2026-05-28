import express from "express";
import { searchUsers, updateProfile } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, searchUsers);
router.patch("/me", protect, updateProfile);

export default router;
