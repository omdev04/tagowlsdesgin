const rooms = new Map();
const globalUsers = new Set();

// Tracks how many rooms each user is present in to keep globalUsers accurate.
const userRoomCounts = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  return rooms.get(roomId);
}

function isUserInRoom(roomId, userId) {
  const room = rooms.get(roomId);
  return !!room && room.has(userId);
}

function addUserToRoom(roomId, userId) {
  const room = getOrCreateRoom(roomId);
  room.add(userId);

  const nextCount = (userRoomCounts.get(userId) || 0) + 1;
  userRoomCounts.set(userId, nextCount);
  globalUsers.add(userId);
}

function removeUserFromRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) {
    return { removedFromRoom: false, roomDeleted: false };
  }

  const removedFromRoom = room.delete(userId);
  let roomDeleted = false;

  if (room.size === 0) {
    rooms.delete(roomId);
    roomDeleted = true;
  }

  if (removedFromRoom) {
    const nextCount = (userRoomCounts.get(userId) || 1) - 1;
    if (nextCount <= 0) {
      userRoomCounts.delete(userId);
      globalUsers.delete(userId);
    } else {
      userRoomCounts.set(userId, nextCount);
    }
  }

  return { removedFromRoom, roomDeleted };
}

function getHealthSnapshot() {
  const usersPerRoom = {};
  for (const [roomId, userSet] of rooms.entries()) {
    usersPerRoom[roomId] = userSet.size;
  }

  return {
    totalRooms: rooms.size,
    totalUsers: globalUsers.size,
    usersPerRoom,
  };
}

module.exports = {
  rooms,
  globalUsers,
  getOrCreateRoom,
  isUserInRoom,
  addUserToRoom,
  removeUserFromRoom,
  getHealthSnapshot,
};
