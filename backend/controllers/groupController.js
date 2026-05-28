import { Group, GroupMember, User } from "../models/index.js";
import { publicUserAttributes } from "../utils/chat.js";

const includeMembers = {
  model: User,
  as: "members",
  attributes: publicUserAttributes,
  through: { attributes: ["role"] },
};

export const getGroups = async (req, res) => {
  try {
    const groups = await Group.findAll({
      include: [includeMembers],
      order: [["updatedAt", "DESC"]],
    });

    const userGroups = groups.filter((group) =>
      group.members.some((member) => member.id === req.user.id),
    );

    return res.json({ groups: userGroups });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load groups" });
  }
};

export const createGroup = async (req, res) => {
  const name = req.body.name?.trim();
  const avatar = req.body.avatar || null;
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(Number) : [];

  if (!name || name.length < 2) {
    return res.status(400).json({ message: "Group name is required" });
  }

  try {
    const group = await Group.create({ name, avatar, createdBy: req.user.id });
    const uniqueMemberIds = [...new Set([req.user.id, ...memberIds].filter(Boolean))];

    await Promise.all(
      uniqueMemberIds.map((userId) =>
        GroupMember.findOrCreate({
          where: { GroupId: group.id, UserId: userId },
          defaults: { role: userId === req.user.id ? "admin" : "member" },
        }),
      ),
    );

    const fullGroup = await Group.findByPk(group.id, { include: [includeMembers] });
    return res.status(201).json({ group: fullGroup });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create group" });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const member = await GroupMember.findOne({
      where: { GroupId: group.id, UserId: req.user.id, role: "admin" },
    });
    if (!member) return res.status(403).json({ message: "Only group admins can edit this group" });

    if (req.body.name?.trim()) group.name = req.body.name.trim();
    if ("avatar" in req.body) group.avatar = req.body.avatar || null;
    await group.save();

    if (Array.isArray(req.body.memberIds)) {
      const nextMemberIds = [...new Set([req.user.id, ...req.body.memberIds.map(Number)].filter(Boolean))];
      await GroupMember.destroy({
        where: {
          GroupId: group.id,
        },
      });
      await Promise.all(
        nextMemberIds.map((userId) =>
          GroupMember.create({
            GroupId: group.id,
            UserId: userId,
            role: userId === req.user.id ? "admin" : "member",
          }),
        ),
      );
    }

    const fullGroup = await Group.findByPk(group.id, { include: [includeMembers] });
    return res.json({ group: fullGroup });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update group" });
  }
};

export const addMember = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.body.userId);

    if (!userId) return res.status(400).json({ message: "User id is required" });

    await GroupMember.findOrCreate({
      where: { GroupId: groupId, UserId: userId },
      defaults: { role: "member" },
    });

    const group = await Group.findByPk(groupId, { include: [includeMembers] });
    return res.json({ group });
  } catch (error) {
    return res.status(500).json({ message: "Unable to add member" });
  }
};

export const removeMember = async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.params.userId);

    await GroupMember.destroy({ where: { GroupId: groupId, UserId: userId } });
    const group = await Group.findByPk(groupId, { include: [includeMembers] });
    return res.json({ group });
  } catch (error) {
    return res.status(500).json({ message: "Unable to remove member" });
  }
};
