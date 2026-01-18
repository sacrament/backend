# 🏗️ Services Architecture Guide

## Current State Analysis

### Current Structure
```
services/
├── contact.service.js          # 172 lines - Contact management
├── user.service.js             # 1090 lines - User operations
├── aws/
│   ├── api.gateway.js          # AWS API Gateway integration
│   └── s3.service.js           # AWS S3 file storage
├── call/
│   └── index.js                # 334 lines - Twilio video calls
├── chat/
│   ├── chat.service.js         # 1145 lines - Chat operations
│   ├── chat.service.db.js      # DB helper methods
│   └── message.service.db.js   # Message helper methods
├── pushNotification/
│   └── index.js                # Push notification handler
└── sms/
    └── index.js                # Twilio SMS sender
```

### Issues Identified

1. **Inconsistent Naming**
   - Some services use `index.js` (call, sms, pushNotification)
   - Some use `service.js` naming (user.service.js, contact.service.js)
   - Some have `db` suffixes (chat.service.db.js)

2. **Large Monolithic Files**
   - user.service.js: 1090 lines (multiple concerns)
   - chat.service.js: 1145 lines (multiple concerns)
   - Need separation of concerns

3. **Mixed Organization**
   - Some external services grouped by provider (aws/, call/, sms/)
   - Some grouped by business domain (chat/)
   - Inconsistent pattern

4. **Missing Documentation**
   - No clear responsibilities for each service
   - No index file to export all services
   - Circular dependencies possible

---

## Proposed New Structure

### Architecture Goals

✅ **Consistency** - All services follow same naming convention
✅ **Separation of Concerns** - Each service has single responsibility
✅ **Clarity** - Easy to find and use services
✅ **Maintainability** - Small, focused files
✅ **Scalability** - Easy to add new services

### New Organization

```
services/
│
├── index.js                    # 🔄 Central export hub (NEW)
├── README.md                   # 📖 Service documentation (NEW)
│
├── domain/                     # 📦 Core business logic (NEW FOLDER)
│   ├── chat/
│   │   ├── index.js           # ChatService export
│   │   ├── chat.service.js    # Chat operations (core)
│   │   ├── message.service.js # Message operations (extracted)
│   │   └── README.md          # Chat service docs
│   │
│   ├── user/
│   │   ├── index.js           # Exports (NEW)
│   │   ├── user.service.js    # User operations (split)
│   │   ├── contact.service.js # Contact management (moved)
│   │   └── README.md          # User service docs (NEW)
│   │
│   └── call/
│       ├── index.js           # CallService export
│       ├── call.service.js    # Call operations (renamed from index.js)
│       └── README.md          # Call service docs (NEW)
│
├── external/                  # 🌐 Third-party integrations (NEW FOLDER)
│   ├── aws/
│   │   ├── index.js           # AWS services export (NEW)
│   │   ├── s3.service.js      # S3 file uploads
│   │   ├── api.gateway.js     # API Gateway integration
│   │   └── README.md          # AWS integration docs (NEW)
│   │
│   ├── twilio/                # 📞 Twilio integration (NEW FOLDER)
│   │   ├── index.js           # Twilio exports (NEW)
│   │   ├── sms.service.js     # SMS sending (moved from sms/)
│   │   ├── video.service.js   # Video calls (moved from call/)
│   │   └── README.md          # Twilio docs (NEW)
│   │
│   └── push/                  # 🔔 Push notifications (RENAMED)
│       ├── index.js           # Push service export
│       ├── push.service.js    # Push notifications (renamed)
│       └── README.md          # Push notification docs (NEW)
│
└── utils/                     # 🛠️ Shared utilities (NEW FOLDER)
    ├── index.js               # Utility exports (NEW)
    ├── helpers.js             # Common helper functions
    └── validators.js          # Input validation
```

---

## Key Changes Explained

### 1. **Folder Organization**

**`domain/`** - Business logic services
- Chat, Users, Calls - Core features
- Each has focused responsibility
- Easy to locate business logic

**`external/`** - Third-party integrations
- AWS, Twilio, Push notifications
- Grouped by provider
- Easy to swap providers

**`utils/`** - Shared utilities
- Helper functions
- Validators
- Common logic used by multiple services

### 2. **Naming Convention**

**All services follow pattern:**
```
folder-name/
├── index.js              # Export public API
├── service-name.js       # Implementation
└── README.md             # Documentation
```

**Examples:**
- `domain/chat/index.js` exports `ChatService`
- `external/aws/index.js` exports `S3Service`, `APIGatewayService`
- `external/twilio/index.js` exports `SMSService`, `VideoService`

### 3. **File Splitting**

**Before:** chat.service.js (1145 lines)
- User lookups
- Chat CRUD
- Message operations
- Media handling
- Reactions

**After:** Split into focused files
- `chat.service.js` - Chat CRUD only
- `message.service.js` - Message operations only
- They coordinate via exports

**Before:** user.service.js (1090 lines)
- User CRUD
- Contact management
- Authentication
- Device tokens

**After:** Split by domain
- `user/user.service.js` - User operations
- `user/contact.service.js` - Contact management
- Clear separation of concerns

### 4. **Central Export Hub**

**`services/index.js`** (NEW)
```javascript
// Domain services
const { ChatService } = require('./domain/chat');
const { UserService } = require('./domain/user');
const { ContactService } = require('./domain/user');
const { CallService } = require('./domain/call');

// External integrations
const { S3Service, APIGatewayService } = require('./external/aws');
const { SMSService, VideoService } = require('./external/twilio');
const { PushService } = require('./external/push');

module.exports = {
  // Domain services
  ChatService,
  UserService,
  ContactService,
  CallService,
  
  // External services
  S3Service,
  APIGatewayService,
  SMSService,
  VideoService,
  PushService,
};
```

**Usage in controllers:**
```javascript
// OLD
const UserService = require('../services/user.service');
const ContactService = require('../services/contact.service');
const SMSService = require('../services/sms');
const S3Service = require('../services/aws/s3.service');

// NEW
const { UserService, ContactService, SMSService, S3Service } = require('../services');
```

---

## Implementation Benefits

### ✅ Better Maintainability
- Small, focused files (200-400 lines each)
- Easy to understand one service's responsibility
- Simple to test individual services

### ✅ Clearer Dependencies
- Domain services import external services
- External services don't import domain services
- No circular dependencies possible

### ✅ Easier to Find Code
- Business logic: look in `domain/`
- Third-party: look in `external/`
- Utilities: look in `utils/`

### ✅ Scalable Architecture
- Add new domain: `domain/newfeature/`
- Add new external: `external/provider/`
- All follow same pattern

### ✅ Better Testing
- Each service independently testable
- Mock external services easily
- Integration tests clear

### ✅ Team Collaboration
- Clear ownership per domain
- Less merge conflicts
- Clear contribution guidelines

---

## Migration Path

### Phase 1: Organize Folders
1. Create `domain/`, `external/`, `utils/` folders
2. Create placeholder `index.js` in each
3. Create `README.md` files

### Phase 2: Extract Services
1. Move and split files
2. Create new `index.js` exports
3. Update implementations as needed

### Phase 3: Update Imports
1. Update all `require()` calls
2. Use new `services/index.js` export
3. Test all modules

### Phase 4: Documentation
1. Update service READMEs
2. Add JSDoc comments
3. Create usage examples

### Phase 5: Cleanup
1. Remove old files
2. Run full test suite
3. Verify no broken imports

---

## Service Responsibilities

### `domain/chat`
**Responsibility:** Chat messaging operations
- Create/update/delete chats
- Manage messages
- Handle reactions
- Media attachments
**Dependencies:** Message model, Media model

### `domain/user`
**Responsibility:** User and contact management
- User CRUD operations
- Contact list management
- User preferences
**Dependencies:** User model, Contact model

### `domain/call`
**Responsibility:** Video call coordination
- Initiate calls
- Generate access tokens
- Track call history
**Dependencies:** Twilio SDK, CallHistory model

### `external/aws`
**Responsibility:** AWS service integration
- S3 file uploads/downloads
- API Gateway integration
**Dependencies:** AWS SDK

### `external/twilio`
**Responsibility:** Twilio integration
- SMS sending
- Video API integration
- Number management
**Dependencies:** Twilio SDK

### `external/push`
**Responsibility:** Push notification delivery
- Send to iOS
- Send to Android
- Track delivery
**Dependencies:** Firebase, APNS SDKs

---

## Naming Conventions

### Files
- Service implementations: `service-name.service.js`
- Utilities: `utility-name.js`
- Validators: `validator-name.js`
- Helpers: `helper-name.js`
- Exports: `index.js`

### Classes
- Service classes: `PascalCaseService` (UserService, ChatService)
- Utilities: `PascalCase` (EmailValidator, DateHelper)

### Methods
- Public: `camelCase()`
- Private: `_privateMethod()`
- Async: `async methodName()`

### Exports
```javascript
module.exports = {
  Service1,
  Service2,
  helper,
  validator,
};
```

---

## Quality Checklist

- [ ] All services in appropriate folder
- [ ] Each service has `index.js` export
- [ ] Each service has `README.md` documentation
- [ ] Central `services/index.js` hub exists
- [ ] No circular dependencies
- [ ] All imports use new structure
- [ ] Services under 400 lines each
- [ ] Each service has single responsibility
- [ ] Tests updated for new structure
- [ ] Documentation updated

---

## Example: How Services Work Together

**User wants to send a message**

```
Controller (POST /chat/message)
    ↓
domain/chat/chat.service.js (ChatService)
    ├─→ Validates message
    ├─→ Calls domain/user/user.service.js (UserService)
    │   └─→ Gets user info
    ├─→ Saves to database
    └─→ If media: calls external/aws/s3.service.js (S3Service)
        └─→ Uploads to S3
```

Each service knows its responsibility. No mixing of concerns.

---

## Next Steps

1. **Review** this structure with your team
2. **Plan** implementation timeline
3. **Create** folder structure
4. **Move** files into proper locations
5. **Split** large service files
6. **Update** all import statements
7. **Test** thoroughly
8. **Document** in service READMEs

---

Created: January 12, 2026
Status: Proposal Ready for Implementation
Target: Improved maintainability and scalability
