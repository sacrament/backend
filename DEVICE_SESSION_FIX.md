# Device-Based Session Displacement Fix

## Overview
Implemented deviceId-based session displacement to prevent the "session displaced" event from firing on the device that just logged in, only on other devices.

## Changes Made

### 1. Auth Service (`server/services/domain/auth/auth.service.js`)
- **authenticatePhone**: Added `deviceId` parameter
- **authenticateApple**: Added `deviceId` parameter  
- **authenticateGoogle**: Added `deviceId` parameter
- **issueTokens**: Modified to accept `deviceId` and exclude matching socket from displacement broadcast

```javascript
// Before: Broadcast to all sockets
getIO().to(userId).emit('session displaced', { ... });

// After: Exclude current device
const userSockets = await io.in(userId).fetchSockets();
for (const socket of userSockets) {
    if (!deviceId || socket.deviceId !== deviceId) {
        socket.emit('session displaced', { ... });
    }
}
```

### 2. Auth Controller (`server/api/controllers/auth.controller.js`)
- **appleAuth**: Extract `deviceId` from request body and pass to service
- **googleAuth**: Extract `deviceId` from request body and pass to service
- **phoneAuth**: Extract `deviceId` from request body and pass to service

### 3. Socket Authentication (`server/middleware/socket.auth.js`)
- Extract `deviceId` from socket handshake (auth, query, or headers)
- Attach `deviceId` to socket object for later use
- Log deviceId in authentication success message

### 4. Socket Connection Handler (`server/socket/index.js`)
- Store `deviceId` in socket.user object
- Store `deviceId` in userSessions map
- Log deviceId in connection messages

## Client Integration

### Login Request
Clients should include `deviceId` in login requests:

```javascript
// iOS/Android
const deviceId = await getDeviceId(); // UUID or device identifier

// Apple Login
POST /api/auth/apple
{
  "appleToken": "...",
  "email": "...",
  "name": "...",
  "deviceId": "ABC123-DEVICE-UUID"
}

// Google Login
POST /api/auth/google
{
  "idToken": "...",
  "deviceId": "ABC123-DEVICE-UUID"
}

// Phone Login
POST /api/auth/phone
{
  "phoneNumber": "+1234567890",
  "otp": "1234",
  "deviceId": "ABC123-DEVICE-UUID"
}
```

### Socket Connection
Clients should include `deviceId` in socket handshake:

```javascript
// Socket.IO Client
const socket = io('https://api.example.com', {
  auth: {
    token: accessToken,
    deviceId: deviceId  // Same deviceId used during login
  }
});
```

## Behavior

### Before Fix
- User logs in on Device A
- All connected sockets (including Device A) receive `session displaced` event
- Device A immediately disconnects even though it just logged in

### After Fix
- User logs in on Device A with `deviceId: "device-a"`
- Device A socket connects with same `deviceId: "device-a"`
- Only Device B, C, etc. receive `session displaced` event
- Device A stays connected

## Testing

1. **Single Device Login**: Login on one device, verify no displacement
2. **Multi-Device Login**: Login on Device A, then Device B, verify only Device A gets displaced
3. **No DeviceId**: Login without deviceId (backward compatible), all sockets get displaced
4. **Socket Reconnection**: Disconnect and reconnect with same deviceId, verify session maintained

## Notes

- `deviceId` is optional for backward compatibility
- If no `deviceId` provided, behavior falls back to displacing all sockets
- `deviceId` should be consistent across login and socket connection
- Recommended to use device UUID or similar stable identifier
