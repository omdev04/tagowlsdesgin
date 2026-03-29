function isValidId(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2 || trimmed.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

function validateJoinLeavePayload(body) {
  const roomId = body && typeof body.roomId === "string" ? body.roomId.trim() : "";
  const userId = body && typeof body.userId === "string" ? body.userId.trim() : "";

  if (!isValidId(roomId)) {
    return { ok: false, error: "Invalid roomId. Use 2-128 chars: letters, numbers, '_' or '-'." };
  }

  if (!isValidId(userId)) {
    return { ok: false, error: "Invalid userId. Use 2-128 chars: letters, numbers, '_' or '-'." };
  }

  return {
    ok: true,
    value: { roomId, userId },
  };
}

module.exports = {
  validateJoinLeavePayload,
};
