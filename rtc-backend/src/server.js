require("dotenv").config();

const express = require("express");
const rtcRoutes = require("./routes/rtcRoutes");
const { createRateLimiter } = require("./services/rateLimitService");
const { assertLiveKitConfig } = require("./livekitService");

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

const globalLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
const joinLeaveLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

app.use(globalLimiter);
app.use("/join", joinLeaveLimiter);
app.use("/leave", joinLeaveLimiter);

app.use(rtcRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
  });
});

try {
  assertLiveKitConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`RTC backend listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;
