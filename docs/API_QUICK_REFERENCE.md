# API Quick Reference Guide

## Base URLs
- Development: `http://localhost:3001`
- Production: `https://service.winky.com` (configure as needed)

## Authentication

All endpoints except `/auth/*` require an `Authorization` header:
```
Authorization: Bearer {accessToken}
```

## Request/Response Format

### Standard Success Response
```json
{
  "status": "success",
  "data": { /* response data */ },
  "pagination": { /* optional */ }
}
```

### Standard Error Response
```json
{
  "status": "error",
  "code": 1001,
  "message": "Error description"
}
```

## Authentication Endpoints

### 1. Facebook Login
```http
POST /auth/facebook
Content-Type: application/json

{
  "fbToken": "facebook_access_token"
}
```

**Response:** AccessToken, RefreshToken, User

---

### 2. Apple Login
```http
POST /auth/apple
Content-Type: application/json

{
  "appleToken": "apple_identity_token"
}
```

**Response:** AccessToken, RefreshToken, User

---

### 3. Phone OTP Request
```http
POST /auth/phone/otp/new/secured
Content-Type: application/json
signature-zootch-code: {sha1_hash}
client-zootch-keycode: VerifyZ00tchKeyCodeSignature
user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)

{
  "phoneNumber": "+1234567890"
}
```

**Response:** 202 Accepted

---

### 4. Phone Login (with OTP)
```http
POST /auth/phone
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otp": "1234"
}
```

**Response:** AccessToken, RefreshToken, User

---

### 5. Refresh Token
```http
GET /auth/token
Authorization: Bearer {refreshToken}
```

**Response:** New AccessToken

---

## User Endpoints

### 1. Search Users
```http
GET /users?name=john&page=0&size=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "user_id",
      "name": "John Doe",
      "pictureUrl": "https://...",
      "bio": "Bio text"
    }
  ],
  "pagination": {
    "page": 0,
    "size": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

### 2. Get User Profile
```http
GET /users/{userId}
Authorization: Bearer {token}
```

---

### 3. Update User Profile
```http
PUT /users/{userId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "New Name",
  "email": "user@example.com",
  "isPublic": true,
  "bio": "My bio"
}
```

---

### 4. Upload User Picture
```http
PUT /users/{userId}/picture
Authorization: Bearer {token}
Content-Type: multipart/form-data

[file: image.jpg]
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "url": "https://s3.amazonaws.com/..."
  }
}
```

---

### 5. Update Device Token
```http
PUT /users/{userId}/device-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "deviceToken": "firebase_token_here",
  "devicePlatform": "ANDROID"
}
```

---

## Me (Current User) Endpoints

### 1. Get My Profile
```http
GET /me
Authorization: Bearer {token}
```

---

### 2. Update My Profile
```http
PUT /me
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "New Name",
  "email": "user@example.com",
  "isPublic": true,
  "bio": "My bio"
}
```

---

### 3. Upload My Picture
```http
PUT /me/picture
Authorization: Bearer {token}
Content-Type: multipart/form-data

[file: image.jpg]
```

---

### 4. Update My Device Token
```http
PUT /me/device-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "deviceToken": "firebase_token_here",
  "devicePlatform": "IOS"
}
```

---

### 5. Update My Location
```http
PUT /me/location
Authorization: Bearer {token}
Content-Type: application/json

{
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

---

### 6. Delete My Account
```http
DELETE /me/deleteAccount
Authorization: Bearer {token}
```

**Response:** 202 Accepted

---

## User Block Endpoints

### 1. Block User
```http
POST /users/blocks
Authorization: Bearer {token}
Content-Type: application/json

{
  "userId": "user_id_to_block",
  "reason": "BAD_BEHAVIOUR",
  "description": "Optional reason description"
}
```

**Valid Reasons:**
- `NO_REASON`
- `BAD_BEHAVIOUR`
- `FAKE_PROFILE`
- `PICTURE`
- `SCAM`
- `UNDERAGE`
- `OTHER`

---

### 2. Unblock User
```http
DELETE /users/blocks/{blockedUserId}
Authorization: Bearer {token}
```

---

### 3. Get My Blocked Users
```http
GET /users/blocks
Authorization: Bearer {token}
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "userId": "blocked_user_id",
      "name": "Blocked User",
      "pictureUrl": "https://...",
      "bio": "Bio",
      "reason": "BAD_BEHAVIOUR",
      "blockedOn": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### 4. Check Block Status
```http
GET /users/blocks/{userId}/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "isBlocked": false,
    "isBlockedBy": true,
    "bidirectionalBlock": false
  }
}
```

---

## Common Error Codes

| Code | Meaning | HTTP Status |
|------|---------|------------|
| 1001 | Missing required field | 400 |
| 1002 | Missing signature header | 400 |
| 1005 | Missing client key code | 400 |
| 1007 | Invalid user agent | 400 |
| 1008 | Invalid token | 401 |
| 1010 | User is blocked | 403 |
| 1103 | Signature verification failed | 400 |
| 1106 | Invalid client key code | 400 |
| 1012 | Invalid phone format | 400 |
| 1013 | Invalid OTP format | 400 |
| 1014 | Invalid or expired OTP | 401 |
| 3129 | Rate limit exceeded (phone) | 429 |
| 9002 | Blocked country (+233) | 400 |
| 9003 | Blocked country (+4474) | 400 |
| 9004 | Blocked country (+23) | 400 |
| 9213 | Rate limit exceeded (IP) | 429 |
| 5000 | Internal server error | 500 |

---

## Rate Limiting

**Phone OTP Request:**
- Per phone number: 5 requests per 2 minutes
- Per IP address: 10 requests per day
- Returns: 429 Too Many Requests

---

## Data Types

### DevicePlatform
```
ANDROID
IOS
```

### UserStatus
```
ACTIVE
BLOCKED
INACTIVE
```

### BlockReason
```
NO_REASON
BAD_BEHAVIOUR
FAKE_PROFILE
PICTURE
SCAM
UNDERAGE
OTHER
```

---

## Example Flow: User Signup

```bash
# 1. Request OTP
curl -X POST http://localhost:3001/auth/phone/otp/new/secured \
  -H "signature-zootch-code: abc123def456..." \
  -H "client-zootch-keycode: VerifyZ00tchKeyCodeSignature" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# 2. Receive OTP via SMS (1234)

# 3. Authenticate with OTP
curl -X POST http://localhost:3001/auth/phone \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "otp": "1234"}'

# Response includes: accessToken, refreshToken, user

# 4. Get user profile
curl -X GET http://localhost:3001/me \
  -H "Authorization: Bearer {accessToken}"

# 5. Update location
curl -X PUT http://localhost:3001/me/location \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060}'

# 6. Search for nearby users (future endpoint)
# curl -X GET http://localhost:3001/users-nearby?radius=5 \
#   -H "Authorization: Bearer {accessToken}"
```

---

## Best Practices

1. **Token Management**
   - Store accessToken in memory or secure storage
   - Store refreshToken securely (localStorage for web, Keychain for mobile)
   - Refresh tokens before expiration

2. **Error Handling**
   - Check response.status field for "success" or "error"
   - Use error codes to determine specific issue
   - Display user-friendly messages

3. **Rate Limiting**
   - Implement exponential backoff
   - Respect 429 responses
   - Don't retry immediately

4. **Security**
   - Always use HTTPS in production
   - Never log tokens
   - Validate input before sending
   - Use CORS-enabled domains

5. **Pagination**
   - Default page size: 20
   - Always check pagination.pages for total pages
   - Implement UI pagination accordingly
