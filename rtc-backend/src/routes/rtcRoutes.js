const express = require("express");

const {
  rooms,
  globalUsers,
  addUserToRoom,
  getHealthSnapshot,
  isUserInRoom,
  removeUserFromRoom,
} = require("../services/stateService");
const { validateJoinLeavePayload } = require("../services/validationService");
const { createJoinToken, getLiveKitUrl } = require("../livekitService");

const router = express.Router();

const MAX_USERS_PER_ROOM = Number(process.env.MAX_USERS_PER_ROOM || 12);
const MAX_GLOBAL_USERS = Number(process.env.MAX_GLOBAL_USERS || 100);

router.post("/join", (req, res) => {
  const validated = validateJoinLeavePayload(req.body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }

  const { roomId, userId } = validated.value;

  if (isUserInRoom(roomId, userId)) {
    return res.status(409).json({ error: "User already exists in room" });
  }

  const room = rooms.get(roomId);
  const roomSize = room ? room.size : 0;
  if (roomSize >= MAX_USERS_PER_ROOM) {
    return res.status(403).json({
      error: "Room user limit exceeded",
      limit: MAX_USERS_PER_ROOM,
    });
  }

  const isGlobalNewUser = !globalUsers.has(userId);
  if (isGlobalNewUser && globalUsers.size >= MAX_GLOBAL_USERS) {
    return res.status(403).json({
      error: "Global user limit exceeded",
      limit: MAX_GLOBAL_USERS,
    });
  }

  addUserToRoom(roomId, userId);

  try {
    const token = createJoinToken(roomId, userId);
    return res.status(200).json({
      token,
      url: getLiveKitUrl(),
    });
  } catch (error) {
    // Rollback on token generation failure.
    removeUserFromRoom(roomId, userId);
    return res.status(500).json({
      error: "Failed to generate token",
      details: error.message,
    });
  }
});

router.post("/leave", (req, res) => {
  const validated = validateJoinLeavePayload(req.body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }

  const { roomId, userId } = validated.value;
  const result = removeUserFromRoom(roomId, userId);

  return res.status(200).json({
    ok: true,
    removedFromRoom: result.removedFromRoom,
    roomDeleted: result.roomDeleted,
  });
});

router.get("/health", (_req, res) => {
  return res.status(200).json(getHealthSnapshot());
});

module.exports = router;
