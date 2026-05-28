import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { publicUserAttributes, serializeUser } from "../utils/chat.js";

const createToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

const sendAuthResponse = (res, statusCode, user) => {
  return res.status(statusCode).json({
    token: createToken(user),
    user: serializeUser(user),
  });
};

export const register = async (req, res) => {
  try {
    const username = req.body.username?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password: hashedPassword });

    return sendAuthResponse(res, 201, user);
  } catch (error) {
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({ message: error.errors[0]?.message || "Invalid user data" });
    }

    return res.status(500).json({ message: "Unable to create account" });
  }
};

export const login = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.scope("withPassword").findOne({ where: { email } });
    const passwordMatches = user ? await bcrypt.compare(password, user.password) : false;

    if (!user || !passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return sendAuthResponse(res, 200, user);
  } catch (error) {
    return res.status(500).json({ message: "Unable to sign in" });
  }
};

export const getMe = async (req, res) => {
  const user = await User.findByPk(req.user.id, { attributes: publicUserAttributes });
  return res.json({ user: serializeUser(user) });
};
