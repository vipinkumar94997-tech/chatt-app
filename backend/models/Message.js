import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Message = sequelize.define("Message", {
  conversationType: {
    type: DataTypes.ENUM("direct", "group"),
    allowNull: false,
  },
  conversationId: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [1, 4000],
    },
  },
  messageType: {
    type: DataTypes.ENUM("text", "image", "voice"),
    allowNull: false,
    defaultValue: "text",
  },
  attachmentUrl: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },
  attachmentName: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  reactions: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "messages",
  timestamps: true,
  indexes: [
    {
      fields: ["conversationType", "conversationId", "createdAt"],
    },
  ],
});

export default Message;
