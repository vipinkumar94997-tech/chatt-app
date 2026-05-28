import User from "./User.js";
import Group from "./Group.js";
import GroupMember from "./GroupMember.js";
import Message from "./Message.js";
import MessageRead from "./MessageRead.js";

User.belongsToMany(Group, { through: GroupMember });
Group.belongsToMany(User, { through: GroupMember, as: "members" });

Group.belongsTo(User, { as: "creator", foreignKey: "createdBy" });
User.hasMany(Group, { as: "createdGroups", foreignKey: "createdBy" });

User.hasMany(Message, { as: "sentMessages", foreignKey: "senderId" });
Message.belongsTo(User, { as: "sender", foreignKey: "senderId" });

Group.hasMany(Message, { as: "messages", foreignKey: "groupId" });
Message.belongsTo(Group, { as: "group", foreignKey: "groupId" });

User.belongsToMany(Message, { through: MessageRead, as: "readMessages" });
Message.belongsToMany(User, { through: MessageRead, as: "readBy" });

export {
  Group,
  GroupMember,
  Message,
  MessageRead,
  User,
};
