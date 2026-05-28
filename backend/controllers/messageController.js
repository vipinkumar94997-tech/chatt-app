import { Op } from "sequelize";
import { Group, GroupMember, Message, MessageRead, User } from "../models/index.js";
import { getDirectConversationId, publicUserAttributes } from "../utils/chat.js";

const includeSender = {
  model: User,
  as: "sender",
  attributes: publicUserAttributes,
};

const includeReadBy = {
  model: User,
  as: "readBy",
  attributes: ["id", "username"],
  through: { attributes: ["createdAt"] },
};

export const getDirectMessages = async (req, res) => {
  const otherUserId = Number(req.params.userId);

  if (!otherUserId) {
    return res.status(400).json({ message: "Valid user id is required" });
  }

  try {
    const conversationId = getDirectConversationId(req.user.id, otherUserId);
    const messages = await Message.findAll({
      where: { conversationType: "direct", conversationId },
      include: [includeSender, includeReadBy],
      order: [["createdAt", "ASC"]],
      limit: 200,
    });

    await markConversationRead(req.user.id, {
      conversationType: "direct",
      conversationId,
    });

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load messages" });
  }
};

export const getGroupMessages = async (req, res) => {
  const groupId = Number(req.params.groupId);

  try {
    const member = await GroupMember.findOne({
      where: { GroupId: groupId, UserId: req.user.id },
    });

    if (!member) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await Message.findAll({
      where: { conversationType: "group", groupId },
      include: [includeSender, includeReadBy],
      order: [["createdAt", "ASC"]],
      limit: 200,
    });

    await markConversationRead(req.user.id, {
      conversationType: "group",
      groupId,
    });

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load group messages" });
  }
};

export const markRead = async (req, res) => {
  try {
    await markConversationRead(req.user.id, req.body);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Unable to mark messages as read" });
  }
};

export const markConversationRead = async (userId, payload) => {
  const where = payload.conversationType === "group"
    ? { conversationType: "group", groupId: payload.groupId, senderId: { [Op.ne]: userId } }
    : { conversationType: "direct", conversationId: payload.conversationId, senderId: { [Op.ne]: userId } };

  const messages = await Message.findAll({ where, attributes: ["id"] });

  await Promise.all(
    messages.map((message) =>
      MessageRead.findOrCreate({
        where: { MessageId: message.id, UserId: userId },
      }),
    ),
  );
};

export const getUnreadSummary = async (userId) => {
  const messages = await Message.findAll({
    where: { senderId: { [Op.ne]: userId } },
    include: [
      {
        model: User,
        as: "readBy",
        attributes: ["id"],
        through: { attributes: [] },
        required: false,
        where: { id: userId },
      },
      {
        model: Group,
        as: "group",
        required: false,
        include: [
          {
            model: User,
            as: "members",
            attributes: ["id"],
            through: { attributes: [] },
            where: { id: userId },
            required: false,
          },
        ],
      },
    ],
  });

  return messages.reduce((summary, message) => {
    if (message.readBy?.length) return summary;
    if (message.conversationType === "group" && !message.group?.members?.length) return summary;

    const key = message.conversationType === "group"
      ? `group:${message.groupId}`
      : `direct:${message.conversationId}`;

    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
};
