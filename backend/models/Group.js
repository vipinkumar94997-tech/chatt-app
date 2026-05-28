import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Group = sequelize.define("Group", {
  name: {
    type: DataTypes.STRING(80),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 80],
    },
  },
  avatar: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: "groups",
  timestamps: true,
});

export default Group;
