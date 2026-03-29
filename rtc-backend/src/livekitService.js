const { AccessToken } = require("livekit-server-sdk");

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

function assertLiveKitConfig() {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    throw new Error(
      "Missing LiveKit configuration. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL."
    );
  }
}

function createJoinToken(roomId, userId) {
  assertLiveKitConfig();

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    ttl: "1h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomId,
  });

  return token.toJwt();
}

function getLiveKitUrl() {
  assertLiveKitConfig();
  return LIVEKIT_URL;
}

module.exports = {
  createJoinToken,
  getLiveKitUrl,
  assertLiveKitConfig,
};
