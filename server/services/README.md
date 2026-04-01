# 📦 Services Overview

This directory contains all business logic and service integrations for the chat-backend application.

## Quick Navigation

### 🎯 For Quick Start
See [SERVICES_ARCHITECTURE.md](../../docs/guides/SERVICES_ARCHITECTURE.md) for detailed architecture guide.

### 🔍 Using Services

```javascript
// NEW: Import all from one place
const { UserService, ChatService, SMSService, S3Service } = require('./services');

// Create instances
const userService = new UserService(UserModel);
const chatService = new ChatService();
```

## Directory Structure

```
services/
│
├── index.js                    # Central export hub
├── README.md                   # This file
│
├── domain/                     # 📦 Core business logic
│   ├── chat/
│   │   ├── index.js           # Chat service export
│   │   ├── chat.service.js    # Chat CRUD operations
│   │   ├── chat.service.db.js # Database helpers
│   │   └── message.service.db.js # Message helpers
│   │
│   ├── user/
│   │   ├── index.js           # User service exports
│   │   ├── user.service.js    # User operations
│   │   └── contact.service.js # Contact management
│   │
│   └── call/
│       ├── index.js           # Call service export
│       └── call.service.js    # Video call operations
│
└── external/                  # 🌐 Third-party integrations
    ├── aws/
    │   ├── index.js           # AWS services export
    │   ├── s3.service.js      # S3 file storage
    │   └── api.gateway.js     # API Gateway
    │
    ├── twilio/
    │   ├── index.js           # Twilio services export
    │   └── sms.service.js     # SMS sending
    │
    └── push/
        ├── index.js           # Push notification export
        └── push.service.js    # Push notifications
```

## Services by Category

### 📱 Domain Services (Business Logic)

| Service | Location | Responsibility |
|---------|----------|-----------------|
| **ChatService** | `domain/chat/` | Chat CRUD, retrieval, operations |
| **UserService** | `domain/user/` | User management, authentication |
| **ContactService** | `domain/user/` | User contacts, contact list |
| **CallService** | `domain/call/` | Video calls, token generation, history |

### 🌐 External Services (Integrations)

| Service | Provider | Location | Responsibility |
|---------|----------|----------|-----------------|
| **S3Service** | AWS | `external/aws/` | File uploads, downloads, storage |
| **APIGatewayService** | AWS | `external/aws/` | API Gateway integration |
| **SMSService** | Twilio | `external/twilio/` | Send SMS messages |
| **PushService** | FCM/APNS | `external/push/` | Push notifications to devices |

## Usage Examples

### Chat Service
```javascript
const { ChatService } = require('./services');
const ChatModel = require('../models/chat');

const chatService = new ChatService();

// Get chat
const chat = await chatService.getById(chatId, userId);

// Create message
const message = await chatService.createMessage(data);
```

### User Service
```javascript
const { UserService, ContactService } = require('./services');
const UserModel = require('../models/user');

const userService = new UserService(UserModel);
const contactService = new ContactService(UserModel);

// Get user
const user = await userService.getById(userId);

// Manage contacts
const contacts = await contactService.storeContacts(contactList, userId);
```

### Call Service
```javascript
const { CallService } = require('./services');
const ChatModel = require('../models/chat');

const callService = new CallService(ChatModel);

// Generate access token
const token = await callService.generateAccessToken(identity, room);
```

### AWS Services
```javascript
const { S3Service, APIGatewayService } = require('./services');

// Upload to S3
const url = await new S3Service().upload(file, bucket);

// API Gateway
const response = await new APIGatewayService().invoke(params);
```

### Twilio SMS
```javascript
const { SMSService } = require('./services');

const smsService = new SMSService();
await smsService.send(from, phones);
```

### Push Notifications
```javascript
const { PushService } = require('./services');

const pushService = new PushService();
await pushService.send(deviceTokens, notification);
```

## Service Responsibilities

### ChatService
- Create, read, update, delete chats
- Retrieve chat messages
- Handle media attachments
- Manage reactions

### UserService
- Register new users
- Update user profile
- Retrieve user info
- Manage authentication

### ContactService
- Store user contacts
- Update contact names
- Retrieve contact list
- Manage contact requests

### CallService
- Initiate video calls
- Generate Twilio access tokens
- Track call history
- End calls gracefully

### S3Service
- Upload files to S3
- Download files from S3
- Generate presigned URLs
- Delete files

### SMSService
- Send SMS messages
- Invite users via SMS
- Track delivery status

### PushService
- Send push notifications
- Handle device tokens
- Support iOS and Android

## Best Practices

### ✅ DO

- Import from central `services/index.js`
- Use service instances for operations
- Handle async/await properly
- Validate input data

### ❌ DON'T

- Import directly from service files (use index.js)
- Mix service responsibilities
- Create global service instances
- Bypass service layer for database access

## Testing Services

Each service can be tested independently:

```javascript
// Mock dependencies
const mockModel = { ... };
const service = new ChatService(mockModel);

// Test operations
expect(await service.getById(id)).toBeDefined();
```

## Adding New Services

1. Create folder in `domain/` or `external/`
2. Create `servicename.service.js` with your service class
3. Create `index.js` to export the service
4. Add to main `services/index.js` export
5. Document in this README

Example:
```
services/external/newprovider/
├── index.js
└── service.service.js
```

## Migration Guide

If you see old imports like:

```javascript
// OLD
const UserService = require('../services/user.service');
const SMSService = require('../services/sms');
const S3Service = require('../services/aws/s3.service');
```

Update to:

```javascript
// NEW
const { UserService, SMSService, S3Service } = require('../services');
```

## See Also

- [Complete Architecture Guide](../../docs/guides/SERVICES_ARCHITECTURE.md)
- [Getting Started](../../docs/GETTING_STARTED.md)
- [Refactoring Report](../../docs/analysis/REFACTORING_COMPLETED.md)
