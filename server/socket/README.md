# 📡 Socket Module Architecture

## Overview

The socket module manages all Socket.IO event handling and real-time communication for the application. It's organized into a clean, maintainable structure separated by domain concerns.

## Directory Structure

```
server/socket/
├── index.js                    # Main Socket.IO initialization
├── chat.service.js             # User connection status service
│
└── handlers/                   # Socket event handlers
    ├── index.js                # Handlers export hub
    │
    ├── chat/                   # Chat event handlers
    │   ├── index.js
    │   └── chat.handler.js     # Chat events (~1392 lines)
    │
    ├── calls/                  # Call event handlers
    │   ├── index.js
    │   └── calls.handler.js    # Call events (~276 lines)
    │
    └── user/                   # User event handlers
        ├── index.js
        └── user.handler.js     # User events (~344 lines)
```

## Architecture

### Main Module: `socket/index.js`

**Responsibility:** Initialize Socket.IO and manage connection lifecycle

**Features:**
- Initialize event handlers once on server startup
- Handle user authentication via middleware
- Manage socket connections and disconnections
- Join/leave user-specific rooms
- Register event handlers per socket (only once)

**Key Functions:**
- `initializeHandlers(io)` - Initialize all event handlers once
- `registerSocketHandlers(socket)` - Register handlers for a socket
- `onConnected(socket)` - Handle new connections
- `onDisconnected(socket)` - Handle disconnections
- `joinUserRoom(socket)` - Join user-specific room
- `leaveUserRoom(socket)` - Leave room on disconnect

### Event Handlers: `handlers/`

Each handler class exports socket events as an object.

#### `handlers/chat/chat.handler.js`
**Manages:** Chat-related operations
**Events:**
- `new chat`, `edit chat`, `delete chat`, `leave chat`
- `new message`, `delete message`
- `react on message`
- `add new chat members`, `remove members from chat`
- `favorite chat`, `block chat`, `mute chat`

#### `handlers/calls/calls.handler.js`
**Manages:** Video call operations
**Events:**
- `create room` - Initiate a call room
- `call` - Initiate a call
- `complete room` - Complete a call
- `end` - End a call

#### `handlers/user/user.handler.js`
**Manages:** User and contact operations
**Events:**
- `store contacts` - Save user contacts
- `edit contact` - Update contact name
- `remove contact`
- `send request` - Send connection request
- `respond request` - Respond to connection request
- `cancel request` - Cancel pending request
- `undo friendship connection` - Remove friendship
- `check connection request`
- `all connection requests` - Get all requests
- `connection request reminder`

### Connection Service: `socket/chat.service.js`

**Purpose:** Check if a user is connected (legacy utility)

**Methods:**
- `isUserConnected(user, checkStatus)` - Verify user connection status

## Handler Registration Flow

```
Server Start
    ↓
socket/index.js initializes
    ↓
initializeHandlers() runs ONCE
    ├─→ ChatHandler instantiated
    ├─→ CallsHandler instantiated
    └─→ UserHandler instantiated
    ↓
All handlers merged into single object
    ↓
Client connects
    ↓
onConnected() called
    ↓
registerSocketHandlers() called
    ├─→ Check _handlersRegistered flag
    ├─→ Register all events for socket (ONLY ONCE)
    └─→ Set _handlersRegistered = true
    ↓
User authenticated and room joined
```

## Key Features

### ✅ Handler Initialization
- Handlers initialized **once** at server startup
- Reused for all socket connections
- Efficient memory usage

### ✅ Handler Registration
- Each socket registers handlers **once**
- Flag prevents duplicate registration
- Safe re-connection handling

### ✅ Error Handling
- Try-catch wrapper around each event
- Error responses sent to client
- Detailed console logging

### ✅ Room Management
- Each user joins their own room (by userId)
- Users notified of connections/disconnections
- Proper cleanup on disconnect

### ✅ Authentication
- JWT verification via middleware
- User ID extracted from token
- Socket disconnected if invalid

## Usage in Application

### Importing Handlers

```javascript
// In socket/index.js
const { ChatHandler, CallsHandler, UserHandler } = require('./handlers');

const chat = new ChatHandler(io);
const calls = new CallsHandler(io);
const user = new UserHandler(io);
```

### Listening to Events

Handler classes return an object with event handlers:

```javascript
module.exports = class ChatHandler {
    constructor(io) {
        this.handler = {
            'new chat': newChat,
            'edit chat': editChat,
            // ... more events
        };
    }
}
```

### Broadcasting Messages

```javascript
// In a handler function (bound to socket context)
this.broadcast.emit('new user connected', data);
this.emit('connected', data);
```

## Best Practices

### DO

- ✅ Keep handlers focused on their domain
- ✅ Use proper error handling
- ✅ Validate input data
- ✅ Broadcast for real-time updates
- ✅ Use acknowledgment callbacks

### DON'T

- ❌ Direct database calls in handlers (use Services)
- ❌ Re-register handlers multiple times
- ❌ Call removeAllListeners()
- ❌ Throw unhandled exceptions
- ❌ Create global handler instances

## Adding New Event Handlers

1. **Create handler file** in appropriate folder:
   ```
   socket/handlers/domain/domain.handler.js
   ```

2. **Define handler class:**
   ```javascript
   module.exports = class DomainHandler {
       constructor(io) {
           this.handler = {
               'event-name': eventHandler,
           };
       }
   }
   
   async function eventHandler(data, callback) {
       // Implementation
   }
   ```

3. **Export from handler index:**
   ```javascript
   // socket/handlers/domain/index.js
   module.exports = require('./domain.handler');
   ```

4. **Import in main socket/index.js:**
   ```javascript
   const DomainHandler = require('./handlers/domain');
   // Then add to initializeHandlers()
   ```

## Migration from Old Structure

**Old:** `communication/index.js`, `communication/calls.js`, `communication/user.js`

**New:** `socket/handlers/chat/`, `socket/handlers/calls/`, `socket/handlers/user/`

**Update imports from:**
```javascript
const Chat = require('../communication');
```

**To:**
```javascript
const { ChatHandler } = require('./handlers');
```

## Performance Considerations

| Aspect | Optimization |
|--------|-------------|
| **Handler Init** | Done once at startup, not per connection |
| **Memory** | Handlers shared across all sockets |
| **Registration** | Guarded by flag to prevent duplicates |
| **Cleanup** | Socket.io auto-cleanup, no manual removeAllListeners |
| **Error Handling** | Try-catch wrapper catches issues early |

## Troubleshooting

### Handlers not firing
- Check if socket is authenticated
- Verify handler is registered
- Check event name spelling

### Memory leaks
- Ensure handlers registered only once
- Socket auto-cleanup works
- No need for manual listener removal

### Duplicate events
- Check _handlersRegistered flag
- Verify no multiple registrations
- Use socket/index.js orchestration

## See Also

- [Services Architecture](../../docs/guides/SERVICES_ARCHITECTURE.md)
- [Socket Authentication](../middleware/socket.auth.js)
- [Socket Configuration](../config/socket.js)
- [Services](../services/README.md)
