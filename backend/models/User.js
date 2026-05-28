import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const User = sequelize.define("User", {
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50],
    },
  },

  email: {
    type: DataTypes.STRING(120),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true,
    },
    set(value) {
      this.setDataValue("email", value.trim().toLowerCase());
    },
  },

  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
    },
  },
  profileImage: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("online", "offline"),
    allowNull: false,
    defaultValue: "offline",
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "users",
  timestamps: true,
  defaultScope: {
    attributes: { exclude: ["password"] },
  },
  scopes: {
    withPassword: {
      attributes: {},
    },
  },
  indexes: [
    {
      unique: true,
      fields: ["email"],
    },
  ],
});

export default User;
