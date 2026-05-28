import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const GroupMember = sequelize.define("GroupMember", {
  role: {
    type: DataTypes.ENUM("admin", "member"),
    allowNull: false,
    defaultValue: "member",
  },
}, {
  tableName: "group_members",
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ["GroupId", "UserId"],
    },
  ],
});

export default GroupMember;
