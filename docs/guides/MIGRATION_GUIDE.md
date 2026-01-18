# Migration Guide - Backend Refactoring

This document guides developers through the backend refactoring changes.

---

## Quick Start (for developers)

### 1. Update Node Modules

```bash
cd server
npm install
# This will install the updated dependencies with socket.io v4, mongoose v7, etc.
```

### 2. Setup Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your actual values
nano .env  # or your favorite editor
```

**Important**: Never commit `.env` to git. It should be in `.gitignore`.

### 3. Start Development Server

```bash
npm run start:dev
# Should see: "Socket.IO started at: ..." with no errors
```

### 4. Verify Socket Connection

Test with a WebSocket client:

```javascript
// Browser console or Node.js client
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token-here'
  }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

---

## Key Changes by Module

### Socket.IO Authentication

**Old Way** (Deprecated):
```javascript
const socketIOJwt = require("socketio-jwt");
io.use(socketIOJwt.authorize({...}));
```

**New Way**:
```javascript
const socketAuth = require('./middleware/socket.auth');
io.use(socketAuth);  // Much simpler!
```

**What Changed**:
- No external dependency on deprecated `socketio-jwt`
- Handles multiple token sources (auth object, query params, headers)
- Better error messages
- Explicit token validation

---

### Configuration/Environment Variables

**Old Way**:
```javascript
// server/utils/config.js
module.exports = {
    APP_SECRET: "mk6w5e5*TQT0",  // Hardcoded ❌
    AWS: {
        ACCESS_KEY_ID: "REDACTED"  // Exposed ❌
    }
}
```

**New Way**:
```javascript
// server/utils/config.js
require('dotenv').config();
module.exports = {
    APP_SECRET: process.env.APP_SECRET || "fallback",  // From env ✅
    AWS: {
        ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "fallback"  // From env ✅
    }
}
```

**Action Required**:
1. Create `.env` file (example provided in `server/.env.example`)
2. Add real credentials to `.env`
3. Never commit `.env` to git
4. Set environment variables in deployment platform

---

### Socket Handler Registration

**Improved Error Handling**:

```javascript
// Now wrapped in try-catch
socket.on(obj.event, (data, ack) => {
    try {
        handler(data, ack);
    } catch (error) {
        console.error(`Error in handler ${obj.event}:`, error);
        if (typeof ack === 'function') {
            ack({ error: error.message });
        }
    }
});
```

**Benefits**:
- Handler errors don't crash server
- Client receives error feedback via callback
- Better logging for debugging

---

### Socket Cleanup on Disconnect

**Fixed Memory Leak**:

```javascript
// OLD: This was removing ALL process listeners! ❌
process.removeAllListeners()  

// NEW: Only remove socket-specific listeners ✅
const removeListenerHandlers = (socket) => {
    socket.removeAllListeners(events);
    socketHandlers.delete(socket);
};
```

---

## Dependency Updates

### What's New

| Package | Old | New | Why |
|---------|-----|-----|-----|
| socket.io | 2.5.0 | 4.7.0 | Major features, better performance |
| mongoose | 5.10.12 | 7.5.0 | Better MongoDB support |
| sequelize | 5.19.8 | 6.33.0 | Latest stable |
| express | 4.17.1 | 4.18.2 | Security patches |

### Breaking Changes to Watch For

#### Socket.IO v4 API Changes

1. **Socket IDs**: May have changed format
   - Old: String like "abc123..."
   - New: Similar but potentially different

2. **Event Signatures**: Slightly different callback patterns
   - Still backward compatible for most use cases

3. **Connection Options**:
   ```javascript
   // Before
   socketIO(server, { pingInterval: 25000 })
   
   // After (same, but with CORS option)
   socketIO(server, { 
     pingInterval: 25000,
     cors: { origin: '*' }  // NEW
   })
   ```

#### Mongoose v7 Changes

1. **Connection Options**:
   ```javascript
   // OLD deprecated options
   useNewUrlParser: true
   useUnifiedTopology: true
   useFindAndModify: false
   
   // NEW: Still work but mongoose v7 ignores them
   // Just remove them if you want
   ```

2. **Query Helpers**: Some query methods may behave slightly differently

---

## File Structure Changes

### New Files

1. **`server/middleware/socket.auth.js`**
   - Modern JWT authentication for socket.io
   - Replace deprecated socketio-jwt package
   - Used by `config/socket.js`

2. **`server/.env.example`**
   - Template for environment variables
   - Copy to `.env` and fill in real values
   - DO NOT COMMIT `.env`

### Modified Files

1. **`server/package.json`**
   - Updated dependency versions
   - Added `dotenv`
   - Removed `socketio-jwt`, `mysql`, `async`

2. **`server/config/socket.js`**
   - Now uses new authentication middleware
   - Fixed memory leaks
   - Better error handling
   - Removed circular dependency

3. **`server/app.js`**
   - Updated socket.io v4 setup
   - Redis adapter configuration updated

4. **`server/utils/config.js`**
   - Loads from environment variables
   - Supports fallback values

---

## Troubleshooting

### Socket Connection Issues

**Problem**: `Authentication error: No token provided`
```
Solution: Make sure token is passed in one of:
- socket handshake auth object
- query parameters
- authorization header
```

**Problem**: `Authentication error: Token expired`
```
Solution: Refresh your JWT token before reconnecting
```

**Problem**: Socket connection hangs
```
Solution: Check CORS settings in socket.io config
- Make sure origin matches your client URL
- In app.js: cors: { origin: 'your-client-url' }
```

### Environment Variable Issues

**Problem**: Credentials not loading
```
Solution:
1. Verify .env file exists in server directory
2. Check file is not in .gitignore
3. Restart server (NODE_ENV values are read at startup)
4. Check .env file permissions
```

**Problem**: Different values in dev vs production
```
Solution:
- Dev: Uses .env file
- Production: Use platform environment variables (AWS, Docker, etc.)
- Never rely on .env in production
```

### Dependency Issues

**Problem**: `npm install` fails
```
Solution:
1. Delete node_modules and package-lock.json
2. Run npm cache clean --force
3. npm install again
4. Check Node.js version (should be 14+)
```

**Problem**: Module not found errors
```
Solution:
1. Verify package is in package.json
2. Run npm install again
3. Check import paths (case-sensitive on Linux)
```

---

## Testing Your Changes

### Test Socket Connection

```javascript
// test-socket.js
const io = require('socket.io-client');

function testConnection() {
  const socket = io('http://localhost:3001', {
    auth: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // Your JWT
    }
  });

  socket.on('connected', (data) => {
    console.log('✅ Connected:', data);
    socket.disconnect();
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Error:', error.message);
    socket.disconnect();
  });

  setTimeout(() => {
    if (socket.connected) {
      console.log('❌ Timeout - no response');
    }
    socket.disconnect();
  }, 5000);
}

testConnection();
```

### Test Event Handlers

```javascript
const socket = io('http://localhost:3001', { auth: { token: '...' } });

// Test chat event
socket.on('connected', () => {
  socket.emit('new chat', {
    members: ['user1', 'user2'],
    name: 'Test Chat'
  }, (response) => {
    if (response.error) {
      console.error('❌ Error:', response.error);
    } else {
      console.log('✅ Chat created:', response);
    }
  });
});
```

---

## Deployment Checklist

- [ ] Pull latest changes
- [ ] Run `npm install` to update dependencies
- [ ] Set all `.env` variables in deployment platform
- [ ] Verify `npm audit` shows no critical vulnerabilities
- [ ] Test socket connections in staging
- [ ] Test with multiple concurrent connections
- [ ] Verify error handling works
- [ ] Check logs for deprecation warnings
- [ ] Monitor server during rollout
- [ ] Keep rollback plan ready

---

## Performance Impact

### Expected Improvements

- ✅ **Better Memory Usage**: Fixed event listener leaks
- ✅ **Faster Authentication**: Native JWT vs deprecated package
- ✅ **Better Error Handling**: Try-catch wrapper prevents crashes
- ✅ **Modern Dependencies**: Better performance optimizations

### Potential Concerns

- ⚠️ Socket.IO v4 may have slightly different performance characteristics
- ⚠️ Mongoose v7 may query slightly different (usually faster)
- ⚠️ Test with production-like load before deployment

---

## Additional Resources

- [Socket.IO v4 Migration Guide](https://socket.io/docs/v4/socket-io-3-migration-guide/)
- [Mongoose v7 Migration](https://mongoosejs.com/docs/migrating_to_7.html)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance/)

---

## Questions or Issues?

1. Check logs: `npm run start:dev` and look for errors
2. Review `../analysis/REFACTORING_COMPLETED.md` for detailed changes
3. Check individual file comments for implementation details
4. Verify environment variables are set correctly

Happy coding! 🚀
