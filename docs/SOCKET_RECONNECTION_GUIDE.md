# Socket.IO Reconnection Guide

## Overview

This guide explains how the Winky backend implements automatic reconnection handling and what client implementations should do to properly handle disconnections and reconnections.

## Server-Side Implementation

### Configuration

The socket.io server is configured with the following reconnection settings:

```javascript
{
  reconnection: true,
  reconnectionDelay: 1000,           // First attempt after 1s
  reconnectionDelayMax: 30000,       // Max 30s between attempts
  reconnectionAttempts: Infinity,    // Unlimited attempts
  pingInterval: 25000,               // Heartbeat every 25s
  pingTimeout: 5000,                 // Timeout if no pong in 5s
}
```

### Reconnection Grace Period

- **Duration**: 5 minutes (300 seconds)
- **Purpose**: Keep user session data alive during temporary disconnections
- **Behavior**: If a user reconnects within 5 minutes, their session is restored

### Server Events

#### Connected
```javascript
socket.emit('connected', { 
  userId: string,
  sessionValid: boolean,
  isReconnection: boolean  // true if reconnecting to existing session
})
```

#### Reconnected
```javascript
socket.emit('reconnected', { 
  userId: string,
  attemptNumber: number
})
```

#### User Connected (broadcast)
```javascript
socket.broadcast.emit('new user connected', { userId })
```

#### User Reconnected (broadcast)
```javascript
socket.broadcast.emit('user reconnected', { userId })
```

#### User Disconnected (broadcast)
```javascript
socket.broadcast.emit('user disconnected', { userId })
```

## Client-Side Implementation

### React Native / iOS Example

```javascript
import io from 'socket.io-client';

class SocketService {
  constructor(token) {
    this.token = token;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity;
    this.messageQueue = []; // Queue for messages during disconnection
  }

  connect(serverUrl) {
    this.socket = io(serverUrl, {
      auth: {
        token: this.token,
        type: 'mobile'
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
      upgrade: true,
    });

    this.setupListeners();
  }

  setupListeners() {
    // Initial connection
    this.socket.on('connected', (data) => {
      console.log('Connected:', data);
      this.reconnectAttempts = 0;
      
      if (data.isReconnection) {
        console.log('Session restored after reconnection');
        this.flushMessageQueue();
      }
      
      this.onConnected?.(data);
    });

    // Reconnection successful
    this.socket.on('reconnected', (data) => {
      console.log('Reconnected after', data.attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
      this.onReconnected?.(data);
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.warn('Connection error:', error);
      this.onConnectError?.(error);
    });

    // Attempting to reconnect
    this.socket.on('reconnect_attempt', () => {
      this.reconnectAttempts++;
      console.log('Reconnection attempt:', this.reconnectAttempts);
      this.onReconnectAttempt?.(this.reconnectAttempts);
    });

    // Failed to reconnect
    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect');
      this.onReconnectFailed?.();
    });

    // Disconnected
    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      
      // Differentiate between network issues and intentional disconnect
      if (reason === 'io client namespace disconnect') {
        // Client intentionally disconnected
        this.messageQueue = [];
      } else {
        // Network issue - will attempt to reconnect
        console.log('Will attempt to reconnect...');
      }
      
      this.onDisconnected?.(reason);
    });

    // Remote user events
    this.socket.on('new user connected', (data) => {
      this.onUserConnected?.(data.userId);
    });

    this.socket.on('user reconnected', (data) => {
      this.onUserReconnected?.(data.userId);
    });

    this.socket.on('user disconnected', (data) => {
      this.onUserDisconnected?.(data.userId);
    });
  }

  // Send message with automatic queueing during disconnection
  sendMessage(event, data, callback) {
    if (this.socket?.connected) {
      this.socket.emit(event, data, callback);
    } else {
      console.warn('Socket not connected. Queueing message:', event);
      this.messageQueue.push({ event, data, callback });
    }
  }

  // Flush queued messages after reconnection
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log('Flushing', this.messageQueue.length, 'queued messages');
    
    // Note: Don't clear queue until confirmed delivery
    const queue = [...this.messageQueue];
    
    queue.forEach(({ event, data, callback }) => {
      console.log('Sending queued message:', event);
      this.socket.emit(event, data, (response) => {
        // Remove from queue only after successful send
        const index = this.messageQueue.findIndex(m => m.event === event && m.data === data);
        if (index !== -1) {
          this.messageQueue.splice(index, 1);
        }
        callback?.(response);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export default SocketService;
```

### Usage Example

```javascript
// Initialize
const socketService = new SocketService(authToken);
socketService.connect('https://api.winky.com');

// Set up callbacks
socketService.onConnected = (data) => {
  console.log('UI: User connected', data);
  updateUIConnected();
};

socketService.onReconnected = (data) => {
  console.log('UI: Reconnected successfully');
  showNotification('Connection restored');
};

socketService.onDisconnected = (reason) => {
  console.log('UI: Disconnected -', reason);
  showOfflineIndicator();
};

socketService.onReconnectAttempt = (attemptNumber) => {
  console.log('UI: Attempting to reconnect...', attemptNumber);
  updateConnectionStatus('reconnecting', attemptNumber);
};

// Send message
socketService.sendMessage('chat:send-message', {
  recipientId: userId,
  content: 'Hello!'
}, (response) => {
  console.log('Message delivered:', response);
});

// Clean up
socketService.disconnect();
```

### Web Client Example

```javascript
// Vue/React component
const useSocket = (authToken) => {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SOCKET_URL, {
      auth: { token: authToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socket.on('connected', (data) => {
      setConnected(true);
      setReconnecting(false);
      if (data.isReconnection) {
        toast.info('Connection restored');
      }
    });

    socket.on('reconnect_attempt', () => {
      setReconnecting(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socketRef.current = socket;

    return () => socket.disconnect();
  }, [authToken]);

  return {
    socket: socketRef.current,
    connected,
    reconnecting
  };
};
```

## Best Practices

### 1. Auto-Reconnection is Enabled
- Clients automatically attempt to reconnect every 1-30 seconds (exponential backoff)
- No manual intervention required for temporary disconnections

### 2. Handle Message Queueing
- Queue outgoing messages during disconnection
- Flush queue after successful reconnection
- Implement acknowledgment callbacks to track delivery

### 3. Session Recovery
- Within 5 minutes: session is fully restored
- After 5 minutes: session expires, user needs to log in again

### 4. UI Feedback
- Show connection status indicator
- Notify users of reconnection attempts
- Display message queueing status
- Show "offline mode" when disconnected

### 5. Error Handling
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Don't alert user on first few attempts
  if (reconnectAttempts > 3) {
    showErrorNotification('Connection problems. Please check your network.');
  }
});

socket.on('reconnect_failed', () => {
  // After max retries
  showErrorNotification('Connection failed. Please refresh the page.');
  // Optionally redirect to login
});
```

### 6. Graceful Disconnection
```javascript
// User logs out - intentionally disconnect
socket.disconnect();

// Clean up resources
messageQueue = [];
```

## Disconnect Reasons

| Reason | Type | Action |
|--------|------|--------|
| `transport error` | Network | Will auto-reconnect within grace period |
| `ping timeout` | Network | Will auto-reconnect within grace period |
| `transport close` | Network | Will auto-reconnect within grace period |
| `io client namespace disconnect` | Intentional | Session cleaned up immediately |
| `io server namespace disconnect` | Server | Session cleaned up immediately |
| `server namespace disconnect` | Server | Session cleaned up immediately |

## Monitoring & Debugging

### Server Logs
```
User connected: 507f1... (mobile) socket: abc123
User disconnected: 507f1... (socket: abc123) reason: ping timeout
⏱ Reconnection grace period started for user: 507f1... (300s)
User reconnected: 507f1... (mobile) socket: def456 (was: abc123)
✓ User successfully reconnected: 507f1... (attempt: 2)
```

### Client Debugging
```javascript
// Enable debug mode
localStorage.debug = 'socket.io-client:socket';

// Check connection state
console.log(socket.connected);
console.log(socket.socket?.io?.engine?.transport?.name);

// View queued messages
console.log(socketService.messageQueue);
```

## Troubleshooting

### Client keeps reconnecting infinitely
- Check if user account is blocked/deleted
- Verify authentication token is still valid
- Check server logs for auth errors

### Messages not sending after reconnect
- Ensure message queue is being flushed
- Check if socket is actually connected before sending
- Verify callbacks are properly implemented

### Session expiring too quickly
- Grace period is 5 minutes - adjust if needed
- Check server time synchronization
- Verify no clock skew between client and server

## Related Documentation

- [Socket Handler Optimization](./SOCKET_HANDLER_OPTIMIZATION.md)
- [Socket Services Refactoring](./SOCKET_SERVICES_REFACTORING.md)
- [API Endpoints](./development/API_ENDPOINTS.md)
