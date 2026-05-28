import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { Server } from "socket.io";
import sequelize from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { markConversationRead } from "./controllers/messageController.js";
import {
  Group,
  GroupMember,
  Message,
  MessageRead,
  User,
} from "./models/index.js";
import {
  getDirectConversationId,
  publicUserAttributes,
  serializeUser,
} from "./utils/chat.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5174";
const server = http.createServer(app);
const onlineUsers = new Map();

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST"],
  },
});

const messageIncludes = [
  { model: User, as: "sender", attributes: publicUserAttributes },
  {
    model: User,
    as: "readBy",
    attributes: ["id", "username"],
    through: { attributes: ["createdAt"] },
  },
];

const buildMessagePayload = ({ text, messageType, attachmentUrl, attachmentName }) => {
  const cleanText = typeof text === "string" ? text.trim() : "";
  const type = ["text", "image", "voice"].includes(messageType) ? messageType : "text";

  if (type === "text" && !cleanText) {
    return { error: "Message text is required" };
  }

  if (type !== "text" && !attachmentUrl) {
    return { error: "Attachment is required" };
  }

  return {
    text: cleanText || (type === "image" ? "Image" : "Voice message"),
    messageType: type,
    attachmentUrl: attachmentUrl || null,
    attachmentName: attachmentName || null,
  };
};

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.send("API Running");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication token is required"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, {
      attributes: publicUserAttributes,
    });
    if (!user) return next(new Error("User not found"));

    socket.user = serializeUser(user);
    return next();
  } catch (error) {
    return next(new Error("Invalid or expired token"));
  }
});

io.on("connection", async (socket) => {
  const userRoom = `user:${socket.user.id}`;
  onlineUsers.set(socket.user.id, socket.id);
  socket.join(userRoom);

  await User.update(
    { status: "online", lastSeen: new Date() },
    { where: { id: socket.user.id } },
  );

  io.emit("presence:update", {
    userId: socket.user.id,
    status: "online",
    lastSeen: new Date().toISOString(),
  });

  socket.on("groups:join", async () => {
    const memberships = await GroupMember.findAll({
      where: { UserId: socket.user.id },
      attributes: ["GroupId"],
    });

    memberships.forEach((membership) => {
      socket.join(`group:${membership.GroupId}`);
    });
  });

  socket.on(
    "chat:typing",
    ({ conversationType, conversationId, receiverId, groupId, isTyping }) => {
      const typingPayload = {
        conversationType,
        conversationId,
        groupId,
        userId: socket.user.id,
        username: socket.user.username,
        isTyping: Boolean(isTyping),
      };

      if (conversationType === "direct" && receiverId) {
        socket.to(`user:${receiverId}`).emit("chat:typing", typingPayload);
      }

      if (conversationType === "group" && groupId) {
        socket.to(`group:${groupId}`).emit("chat:typing", typingPayload);
      }
    },
  );

  socket.on("direct:message", async (payload, callback) => {
    const { receiverId } = payload;
    const messagePayload = buildMessagePayload(payload);
    const targetUserId = Number(receiverId);

    if (!targetUserId || messagePayload.error) {
      callback?.({ ok: false, message: messagePayload.error || "Recipient is required" });
      return;
    }

    try {
      const conversationId = getDirectConversationId(
        socket.user.id,
        targetUserId,
      );
      const message = await Message.create({
        conversationType: "direct",
        conversationId,
        ...messagePayload,
        senderId: socket.user.id,
      });

      await MessageRead.findOrCreate({
        where: { MessageId: message.id, UserId: socket.user.id },
      });

      const fullMessage = await Message.findByPk(message.id, {
        include: messageIncludes,
      });

      io.to(userRoom)
        .to(`user:${targetUserId}`)
        .emit("message:new", fullMessage);
      callback?.({ ok: true, message: fullMessage });
    } catch (error) {
      callback?.({ ok: false, message: "Message could not be sent" });
    }
  });

  socket.on("group:message", async (payload, callback) => {
    const { groupId } = payload;
    const messagePayload = buildMessagePayload(payload);
    const targetGroupId = Number(groupId);

    if (!targetGroupId || messagePayload.error) {
      callback?.({ ok: false, message: messagePayload.error || "Group is required" });
      return;
    }

    try {
      const membership = await GroupMember.findOne({
        where: { GroupId: targetGroupId, UserId: socket.user.id },
      });

      if (!membership) {
        callback?.({
          ok: false,
          message: "You are not a member of this group",
        });
        return;
      }

      const message = await Message.create({
        conversationType: "group",
        conversationId: `group:${targetGroupId}`,
        groupId: targetGroupId,
        ...messagePayload,
        senderId: socket.user.id,
      });

      await MessageRead.findOrCreate({
        where: { MessageId: message.id, UserId: socket.user.id },
      });

      const fullMessage = await Message.findByPk(message.id, {
        include: messageIncludes,
      });

      io.to(`group:${targetGroupId}`).emit("message:new", fullMessage);
      callback?.({ ok: true, message: fullMessage });
    } catch (error) {
      callback?.({ ok: false, message: "Group message could not be sent" });
    }
  });

  socket.on("messages:read", async (payload) => {
    await markConversationRead(socket.user.id, payload);
    io.emit("messages:read", { ...payload, userId: socket.user.id });
  });

  socket.on("message:edit", async ({ messageId, text }, callback) => {
    const cleanText = typeof text === "string" ? text.trim() : "";
    if (!cleanText) {
      callback?.({ ok: false, message: "Message text is required" });
      return;
    }

    const message = await Message.findByPk(messageId);
    if (!message || message.senderId !== socket.user.id || message.deletedAt) {
      callback?.({ ok: false, message: "Message cannot be edited" });
      return;
    }

    message.text = cleanText;
    message.editedAt = new Date();
    await message.save();

    const fullMessage = await Message.findByPk(message.id, { include: messageIncludes });
    io.emit("message:updated", fullMessage);
    callback?.({ ok: true, message: fullMessage });
  });

  socket.on("message:delete", async ({ messageId }, callback) => {
    const message = await Message.findByPk(messageId);
    if (!message || message.senderId !== socket.user.id) {
      callback?.({ ok: false, message: "Message cannot be deleted" });
      return;
    }

    message.text = "This message was deleted";
    message.attachmentUrl = null;
    message.attachmentName = null;
    message.deletedAt = new Date();
    await message.save();

    const fullMessage = await Message.findByPk(message.id, { include: messageIncludes });
    io.emit("message:updated", fullMessage);
    callback?.({ ok: true, message: fullMessage });
  });

  socket.on("message:reaction", async ({ messageId, reaction }, callback) => {
    const message = await Message.findByPk(messageId);
    if (!message || message.deletedAt) {
      callback?.({ ok: false, message: "Message cannot be reacted to" });
      return;
    }

    const nextReactions = { ...(message.reactions || {}) };
    if (nextReactions[socket.user.id] === reaction) {
      delete nextReactions[socket.user.id];
    } else {
      nextReactions[socket.user.id] = reaction;
    }

    message.reactions = nextReactions;
    await message.save();

    const fullMessage = await Message.findByPk(message.id, { include: messageIncludes });
    io.emit("message:updated", fullMessage);
    callback?.({ ok: true, message: fullMessage });
  });

  socket.on("group:created", async (groupId) => {
    const group = await Group.findByPk(groupId, {
      include: [
        {
          model: User,
          as: "members",
          attributes: publicUserAttributes,
          through: { attributes: ["role"] },
        },
      ],
    });

    group?.members?.forEach((member) => {
      io.to(`user:${member.id}`).emit("group:updated", group);
    });
  });

  socket.on("disconnect", async () => {
    if (onlineUsers.get(socket.user.id) !== socket.id) return;

    onlineUsers.delete(socket.user.id);
    const lastSeen = new Date();
    await User.update(
      { status: "offline", lastSeen },
      { where: { id: socket.user.id } },
    );

    io.emit("presence:update", {
      userId: socket.user.id,
      status: "offline",
      lastSeen: lastSeen.toISOString(),
    });
  });
});

const ensureDatabaseExists = async () => {
  const databaseName = process.env.DB_NAME || "chat_app";

  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error(
      "DB_NAME can only contain letters, numbers, and underscores",
    );
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await connection.end();
};

const startServer = async () => {
  if (!process.env.JWT_SECRET) {
    console.warn(
      "JWT_SECRET is not set. Add one to backend/.env before production.",
    );
    process.env.JWT_SECRET = "development_secret_change_me";
  }

  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    console.log("MySQL Connected");
    await sequelize.sync({ alter: true });
    console.log("Tables Ready");

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${port} is already in use. Stop the existing server or set PORT in backend/.env.`,
        );
        process.exit(1);
      }

      throw error;
    });

    server.listen(port, () => {
      console.log(`Server Running on port ${port}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
};

startServer();
