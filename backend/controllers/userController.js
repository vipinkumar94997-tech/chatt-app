import { Op } from "sequelize";
import { User } from "../models/index.js";
import { publicUserAttributes, serializeUser } from "../utils/chat.js";

export const searchUsers = async (req, res) => {
  const search = req.query.search?.trim() || "";

  try {
    const users = await User.findAll({
      attributes: publicUserAttributes,
      where: {
        id: { [Op.ne]: req.user.id },
        ...(search
          ? {
              username: {
                [Op.like]: `%${search}%`,
              },
            }
          : {}),
      },
      order: [["username", "ASC"]],
      limit: 20,
    });

    return res.json({ users: users.map(serializeUser) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to search users" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const username = req.body.username?.trim();
    const profileImage = req.body.profileImage;

    if (!username || username.length < 2 || username.length > 50) {
      return res.status(400).json({ message: "Username must be 2-50 characters" });
    }

    if (profileImage && profileImage.length > 1_500_000) {
      return res.status(400).json({ message: "Profile image is too large" });
    }

    const user = await User.findByPk(req.user.id);
    user.username = username;
    user.profileImage = profileImage || null;
    await user.save();

    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update profile" });
  }
};
