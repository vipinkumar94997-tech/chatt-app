CREATE DATABASE IF NOT EXISTS chat_app;
USE chat_app;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  profileImage LONGTEXT NULL,
  status ENUM('online', 'offline') NOT NULL DEFAULT 'offline',
  lastSeen DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  avatar LONGTEXT NULL,
  createdBy INT NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  GroupId INT NOT NULL,
  UserId INT NOT NULL,
  UNIQUE KEY unique_group_member (GroupId, UserId),
  FOREIGN KEY (GroupId) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (UserId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversationType ENUM('direct', 'group') NOT NULL,
  conversationId VARCHAR(80) NOT NULL,
  text TEXT NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  senderId INT NULL,
  groupId INT NULL,
  INDEX messages_conversation_idx (conversationType, conversationId, createdAt),
  FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_reads (
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  MessageId INT NOT NULL,
  UserId INT NOT NULL,
  UNIQUE KEY unique_message_read (MessageId, UserId),
  FOREIGN KEY (MessageId) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (UserId) REFERENCES users(id) ON DELETE CASCADE
);
