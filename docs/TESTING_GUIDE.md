# API Implementation Testing Guide

## Setup for Testing

### 1. Start the Development Server
```bash
cd server
npm run start:dev
```

Server should start on `http://localhost:3001`

### 2. Test Tools
- **Postman** - Full-featured API testing
- **cURL** - Command-line testing
- **REST Client Extension** - VS Code extension
- **Thunder Client** - VS Code extension

## Health Check

### Verify Server is Running
```bash
curl http://localhost:3001/
# Expected response: {"title":"Winky"}
```

---

## Authentication Testing

### Test 1: Facebook Authentication
```bash
curl -X POST http://localhost:3001/auth/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "fbToken": "test_facebook_token_123"
  }'
```

**Expected Response (Success):**
```json
{
  "status": "success",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "mongo_id",
    "name": "Facebook User",
    "status": "ACTIVE"
  },
  "otpRequired": false
}
```

**Expected Response (Error):**
```json
{
  "status": "error",
  "code": 1001,
  "message": "Facebook token is required and cannot be blank"
}
```

---

### Test 2: Phone OTP Request (with Rate Limiting)
```bash
# First request should succeed
curl -X POST http://localhost:3001/auth/phone/otp/new/secured \
  -H "Content-Type: application/json" \
  -H "signature-zootch-code: $(echo -n 'Winky2019Chat' | sha1sum | cut -d' ' -f1)" \
  -H "client-zootch-keycode: VerifyZ00tchKeyCodeSignature" \
  -H "user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)" \
  -d '{
    "phoneNumber": "+18005551234"
  }'
```

**Expected Response (Success):**
```json
{
  "status": "success",
  "message": "OTP sent to phone number"
}
```

**Expected Response (Missing Signature):**
```json
{
  "status": "error",
  "code": 1002,
  "message": "Missing signature header"
}
```

**Expected Response (Blocked Country):**
```json
{
  "status": "error",
  "code": 9002,
  "message": "Phone number from this region is not allowed"
}
```

---

### Test 3: Phone Authentication
```bash
# Note: OTP is generated and stored in memory during OTP request
# For testing, you need to capture or mock the OTP
curl -X POST http://localhost:3001/auth/phone \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+18005551234",
    "otp": "1234"
  }'
```

**Expected Response (Success):**
```json
{
  "status": "success",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "mongo_id",
    "phone": "+18005551234",
    "status": "ACTIVE"
  }
}
```

**Expected Response (Invalid OTP):**
```json
{
  "status": "error",
  "code": 1014,
  "message": "Invalid or expired OTP"
}
```

---

### Test 4: Token Refresh
```bash
# First, get tokens from auth/phone or auth/facebook
# Then use refresh token to get new access token
curl -X GET http://localhost:3001/auth/token \
  -H "Authorization: Bearer {refreshToken}"
```

**Expected Response:**
```json
{
  "status": "success",
  "accessToken": "eyJhbGc..."
}
```

---

## User Endpoints Testing

### Prerequisites
You need a valid `{token}` from authentication. Save it:
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
USER_ID="mongo_user_id_here"
```

---

### Test 5: Search Users
```bash
curl -X GET "http://localhost:3001/users?name=john&page=0&size=20" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Expected Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "user_id",
      "name": "John Doe",
      "pictureUrl": null,
      "bio": null
    }
  ],
  "pagination": {
    "page": 0,
    "size": 20,
    "total": 1,
    "pages": 1
  }
}
```

---

### Test 6: Get User Profile
```bash
curl -X GET "http://localhost:3001/users/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "id": "user_id",
    "status": "ACTIVE",
    "name": "User Name",
    "email": null,
    "phone": "+18005551234",
    "pictureUrl": null,
    "isPublic": false,
    "bio": null
  }
}
```

**Expected Response (Authorization Error - different user):**
```json
{
  "status": "error",
  "message": "You do not have permission to view this user's profile"
}
```

---

### Test 7: Update User Profile
```bash
curl -X PUT "http://localhost:3001/users/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "email": "user@example.com",
    "isPublic": true,
    "bio": "My updated bio"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "id": "user_id",
    "name": "Updated Name",
    "email": "user@example.com",
    "isPublic": true,
    "bio": "My updated bio"
  }
}
```

**Expected Response (Missing isPublic):**
```json
{
  "status": "error",
  "message": "isPublic field is required and must be a boolean"
}
```

---

### Test 8: Update Device Token
```bash
curl -X PUT "http://localhost:3001/users/${USER_ID}/device-token" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceToken": "firebase_device_token_12345",
    "devicePlatform": "ANDROID"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Device token updated"
}
```

---

## Me (Current User) Endpoints Testing

### Test 9: Get Current User Profile
```bash
curl -X GET http://localhost:3001/me \
  -H "Authorization: Bearer ${TOKEN}"
```

**Expected Response:** Same format as Get User Profile

---

### Test 10: Update Current User Profile
```bash
curl -X PUT http://localhost:3001/me \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Name",
    "isPublic": false,
    "bio": "Updated bio"
  }'
```

---

### Test 11: Update User Location
```bash
curl -X PUT http://localhost:3001/me/location \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 40.7128,
    "longitude": -74.0060
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Location updated"
}
```

**Expected Response (Invalid Latitude):**
```json
{
  "status": "error",
  "message": "Invalid latitude. Must be between -90 and 90"
}
```

---

### Test 12: Delete Current User Account
```bash
curl -X DELETE http://localhost:3001/me/deleteAccount \
  -H "Authorization: Bearer ${TOKEN}"
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Account deleted successfully"
}
```

---

## User Block Endpoints Testing

### Prerequisites
You need two users: one to block, one to be blocked. Get their IDs:
```bash
BLOCKER_TOKEN="token_of_blocker"
BLOCKED_USER_ID="user_id_to_block"
```

---

### Test 13: Block User
```bash
curl -X POST http://localhost:3001/users/blocks \
  -H "Authorization: Bearer ${BLOCKER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "${BLOCKED_USER_ID}",
    "reason": "BAD_BEHAVIOUR",
    "description": "Spam and harassment"
  }'
```

**Expected Response:**
```
HTTP/1.1 204 No Content
```

**Expected Response (Invalid Reason):**
```json
{
  "status": "error",
  "message": "Invalid block reason. Must be one of: NO_REASON, BAD_BEHAVIOUR, FAKE_PROFILE, PICTURE, SCAM, UNDERAGE, OTHER"
}
```

**Expected Response (Self-Block Attempt):**
```json
{
  "status": "error",
  "message": "You cannot block yourself"
}
```

---

### Test 14: Get Blocked Users List
```bash
curl -X GET http://localhost:3001/users/blocks \
  -H "Authorization: Bearer ${BLOCKER_TOKEN}"
```

**Expected Response:**
```json
{
  "status": "success",
  "data": [
    {
      "userId": "blocked_user_id",
      "name": "Blocked User Name",
      "pictureUrl": null,
      "bio": "User bio",
      "reason": "BAD_BEHAVIOUR",
      "blockedOn": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Test 15: Check Block Status
```bash
curl -X GET "http://localhost:3001/users/blocks/${BLOCKED_USER_ID}/status" \
  -H "Authorization: Bearer ${BLOCKER_TOKEN}"
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "isBlocked": true,
    "isBlockedBy": false,
    "bidirectionalBlock": false
  }
}
```

---

### Test 16: Unblock User
```bash
curl -X DELETE "http://localhost:3001/users/blocks/${BLOCKED_USER_ID}" \
  -H "Authorization: Bearer ${BLOCKER_TOKEN}"
```

**Expected Response:**
```
HTTP/1.1 204 No Content
```

---

## Error Scenarios Testing

### Test 17: Missing Authentication Token
```bash
curl -X GET http://localhost:3001/me
```

**Expected Response:**
```
HTTP/1.1 401 Unauthorized
```

---

### Test 18: Invalid Token
```bash
curl -X GET http://localhost:3001/me \
  -H "Authorization: Bearer invalid.token.here"
```

**Expected Response:**
```
HTTP/1.1 401 Unauthorized
```

---

### Test 19: Rate Limiting
```bash
# Make 6 OTP requests from same phone within 2 minutes
for i in {1..6}; do
  curl -X POST http://localhost:3001/auth/phone/otp/new/secured \
    -H "Content-Type: application/json" \
    -H "signature-zootch-code: $(echo -n 'Winky2019Chat' | sha1sum | cut -d' ' -f1)" \
    -H "client-zootch-keycode: VerifyZ00tchKeyCodeSignature" \
    -d '{"phoneNumber": "+18005551234"}'
  echo "Request $i"
done
```

**6th Request Expected Response:**
```json
{
  "status": "error",
  "code": 3129,
  "message": "Rate limit exceeded for phone number"
}
```

---

## Database Verification

### Check User Was Created
```bash
# In MongoDB:
db.users.findOne({ phone: "+18005551234" })
```

### Check Block Record
```bash
db.blockusers.findOne({ blockerId: ObjectId("...") })
```

---

## Performance Testing

### Test Load with Artillery
```bash
npm install -g artillery

# Create test file: load-test.yml
scenarios:
  - name: Search Users
    requests:
      - url: "http://localhost:3001/users?name=test"
        headers:
          Authorization: "Bearer {{token}}"

artillery run load-test.yml --target http://localhost:3001
```

---

## Debugging Tips

### 1. Enable Detailed Logging
```bash
NODE_DEBUG=* npm run start:dev
```

### 2. Check Express Middleware Order
Verify verify.js is applied to protected routes

### 3. Inspect Tokens
Decode JWT tokens at https://jwt.io:
```bash
# Copy token (without "Bearer " prefix) and paste in jwt.io
```

### 4. Database Inspection
```bash
# Connect to MongoDB
mongo
use winky
db.users.find().pretty()
db.blockusers.find().pretty()
```

### 5. Check Memory Rate Limiting
Add logging to see rate limit store state:
```javascript
console.log('Rate limit store:', rateLimitStore);
```

---

## Common Issues & Solutions

### Issue: "User not authenticated"
**Cause:** Missing or invalid Authorization header
**Solution:** Ensure token is included and valid

### Issue: "Invalid phone format"
**Cause:** Phone format doesn't match regex
**Solution:** Use format +[country_code][number] (min 6, max 15 digits)

### Issue: "Rate limit exceeded"
**Cause:** Too many requests from same phone/IP
**Solution:** Wait for window to reset (check code for timing)

### Issue: "You do not have permission"
**Cause:** Trying to update/view another user's data
**Solution:** Use endpoints for current user or ensure user IDs match

### Issue: Models not found
**Cause:** Database models not loaded
**Solution:** Check bootstrap/database.js loadModels() function

---

## Next Steps for Integration

1. **Replace OTP Storage**
   - Move from in-memory to Redis
   - Implement TTL expiration

2. **Implement Picture Upload**
   - Integrate S3 service
   - Test file size limits

3. **Add SMS Service**
   - Connect Twilio for OTP delivery
   - Add retry logic

4. **Test with Mobile Clients**
   - iOS app with generated tokens
   - Android app with device platform

5. **Setup CI/CD Testing**
   - Automated test suite
   - Integration tests
   - Performance benchmarks
