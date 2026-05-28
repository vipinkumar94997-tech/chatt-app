import sequelize from "../config/db.js";

const MessageRead = sequelize.define("MessageRead", {}, {
  tableName: "message_reads",
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ["MessageId", "UserId"],
    },
  ],
});

export default MessageRead;
