export const getDirectConversationId = (firstUserId, secondUserId) => {
  return [Number(firstUserId), Number(secondUserId)].sort((a, b) => a - b).join(":");
};

export const publicUserAttributes = [
  "id",
  "username",
  "email",
  "profileImage",
  "status",
  "lastSeen",
  "createdAt",
  "updatedAt",
];

export const serializeUser = (user) => {
  if (!user) return null;

  const rawUser = user.toJSON ? user.toJSON() : user;
  return {
    id: rawUser.id,
    username: rawUser.username,
    email: rawUser.email,
    profileImage: rawUser.profileImage,
    status: rawUser.status,
    lastSeen: rawUser.lastSeen,
    createdAt: rawUser.createdAt,
    updatedAt: rawUser.updatedAt,
  };
};
