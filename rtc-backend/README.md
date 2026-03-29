# RTC Backend (LiveKit + In-Memory State)

Lightweight production-oriented control layer for LiveKit using Node.js + Express.

## Stack

- Node.js
- Express
- livekit-server-sdk
- dotenv

## Important Limitation

This backend uses in-memory storage:

- All room/user state resets on restart
- Not suitable for multi-instance horizontal scaling

## Environment

Copy `.env.example` to `.env` and fill values:

- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- LIVEKIT_URL
- MAX_USERS_PER_ROOM=12
- MAX_GLOBAL_USERS=100
- PORT=3001

## Run

```bash
npm install
node server.js
```

## APIs

### POST /join

Body:

```json
{
  "roomId": "room_123",
  "userId": "user_456"
}
```

Behavior:

- Creates room if missing
- Prevents duplicate user in same room
- Enforces room and global user limits
- Returns LiveKit token and URL

Response:

```json
{
  "token": "...",
  "url": "wss://your-livekit-host"
}
```

### POST /leave

Body:

```json
{
  "roomId": "room_123",
  "userId": "user_456"
}
```

Behavior:

- Removes user from room
- Updates global users set
- Deletes room if empty

### GET /health

Response:

```json
{
  "totalRooms": 2,
  "totalUsers": 8,
  "usersPerRoom": {
    "room_123": 5,
    "room_abc": 3
  }
}
```
