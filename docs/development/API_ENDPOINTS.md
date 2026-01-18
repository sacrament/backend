# ZOOTCH API Endpoints Documentation

## Table of Contents
1. [Authentication Endpoints](#authentication-endpoints)
2. [User Endpoints](#user-endpoints)
3. [User Profile (Me) Endpoints](#user-profile-me-endpoints)
4. [Event Endpoints](#event-endpoints)
5. [Event Report Endpoints](#event-report-endpoints)
6. [Nearby Users Endpoints](#nearby-users-endpoints)
7. [User Block Endpoints](#user-block-endpoints)
8. [User Favorites Endpoints](#user-favorites-endpoints)
9. [Chat/Applozic Endpoints](#chatapplozic-endpoints)
10. [Index Endpoint](#index-endpoint)

---

## Authentication Endpoints

### Base Path: `/auth`

#### 1. Facebook Authentication
- **Endpoint**: `POST /auth/facebook`
- **Parameters**: 
  - **Body** (JSON): `FacebookAuthRequest`
    - Required fields determined by validation annotations
- **Response**: `AuthResponse`
- **Business Logic**: 
  - Validates Facebook authentication request
  - Authenticates user via FacebookAuthService
  - Returns authentication response with tokens

#### 2. Apple Authentication
- **Endpoint**: `POST /auth/apple`
- **Parameters**: 
  - **Body** (JSON): `AppleAuthRequest`
    - Required fields determined by validation annotations
- **Response**: `AuthResponse`
- **Business Logic**: 
  - Validates Apple authentication request
  - Authenticates user via AppleAuthService
  - Returns authentication response with tokens

#### 3. Send Phone OTP (Secured)
- **Endpoint**: `POST /auth/phone/otp/new/secured`
- **Parameters**: 
  - **Header**: `signature-zootch-code` (required) - SHA1 hash of signature
  - **Header**: `client-zootch-keycode` (required) - Client key code for verification
  - **Header**: `user-agent` (optional) - Device user agent
  - **Header**: `accept` (optional) - Accept header
  - **Body** (JSON): `PhoneOtpRequest`
    - `phoneNumber` (String, required)
- **Response**: 
  - `202 Accepted` on success
  - `400 Bad Request` with error code on failure
- **Business Logic**:
  - **Validation Steps**:
    - Blocks numbers starting with: +233, +4474, +23
    - Validates signature against SHA1 hash
    - Validates client key code against fixed value "VerifyZ00tchKeyCodeSignature"
  - **Rate Limiting**: Uses token bucket algorithm with limits:
    - 1 request per 5 seconds (global)
    - 5 requests per 2 minutes (per phone number)
    - 10 requests per day (per IP/phone)
  - **Device Verification**: Checks user agent for valid mobile platforms (iOS/Android)
  - **IP Tracking**: Tracks requests by IP address and applies rate limiting
  - **Error Codes**:
    - `9002`: Blocked phone number (+233)
    - `9003`: Blocked phone number (+4474)
    - `9004`: Blocked phone number (+23)
    - `1002`: Missing signature
    - `1005`: Missing key code
    - `1103`: Signature mismatch
    - `1106`: Key code mismatch
    - `3129`: Rate limit exceeded (phone number)
    - `9213`: Rate limit exceeded (IP address)
    - `1007`: Invalid user agent
  - Sends OTP via PhoneAuthService

#### 4. Phone Authentication
- **Endpoint**: `POST /auth/phone`
- **Parameters**: 
  - **Body** (JSON): `PhoneAuthRequest`
    - Required fields: phone number, OTP
- **Response**: `AuthResponse`
- **Business Logic**: 
  - Validates phone number and OTP
  - Authenticates user via PhoneAuthService
  - Returns authentication response with tokens

#### 5. Token Refresh
- **Endpoint**: `GET /auth/token`
- **Parameters**: 
  - **Header**: `Authorization` (required, @NotBlank) - Bearer token with refresh scope
- **Response**: `TokenRefreshResponse`
  - Returns new access token
- **Business Logic**:
  - Validates authorization header format (must start with configured prefix)
  - Parses JWT token and extracts userId and scope
  - Validates that scope equals "REFRESH_TOKEN_SCOPE"
  - Checks if user exists and is active
  - Generates and returns new access token
  - Throws `AuthenticationException` if:
    - Invalid token format
    - Invalid token signature
    - User not found
    - User is not active
    - Scope is not refresh token scope

---

## User Endpoints

### Base Path: `/users`

#### 1. Search Users
- **Endpoint**: `GET /users`
- **Parameters**: 
  - **Query**: `name` (String, required) - User name to search
  - **Query**: `pageable` (Pageable) - Pagination parameters (page, size, sort)
- **Response**: `Page<UserSearchResponse>`
- **Business Logic**:
  - Searches for active users by name prefix
  - Returns paginated results
  - Uses UserService.getActiveNameStarting() for efficient prefix matching

#### 2. Get User Details
- **Endpoint**: `GET /users/{id}`
- **Parameters**: 
  - **Path**: `id` (Long, @NotNull) - User ID
- **Response**: `UserResponse`
- **Business Logic**:
  - Validates that requesting user has permission to view target user (same user ID check)
  - Retrieves user details
  - Maps to UserResponse DTO
  - Throws `RequestForbiddenException` if user tries to access another user's profile

#### 3. Update User Profile
- **Endpoint**: `PUT /users/{id}`
- **Parameters**: 
  - **Path**: `id` (Long, @NotNull) - User ID
  - **Body** (JSON): `UserEditRequest` (@Valid)
    - Updatable user fields
- **Response**: `UserResponse`
- **Business Logic**:
  - Validates permission (current user must equal target user ID)
  - Maps request fields to user entity
  - Saves user and updates cache
  - Returns updated user response
  - Throws `RequestForbiddenException` if not authorized

#### 4. Update User Picture
- **Endpoint**: `PUT /users/{id}/picture`
- **Parameters**: 
  - **Path**: `id` (Long, @NotNull) - User ID
  - **Form**: `file` (MultipartFile, required) - Picture file
- **Response**: `UploadResponse`
  - Contains new picture URL
- **Business Logic**:
  - Validates permission (current user must equal target user ID)
  - Uploads file to storage service under "users/pictures" directory
  - Deletes old picture from storage
  - Updates user picture URL
  - Saves user to database
  - Returns upload response with new picture URL

#### 5. Update Device Token
- **Endpoint**: `PUT /users/{id}/device-token`
- **Parameters**: 
  - **Path**: `id` (Long, @NotNull) - User ID
  - **Body** (JSON): `DeviceTokenDto` (@Valid)
    - `deviceToken` (String) - Device push notification token
    - `devicePlatform` (String) - Platform (iOS/Android)
- **Response**: `202 Accepted`
- **Business Logic**:
  - Validates permission (current user must equal target user ID)
  - Updates user device token and platform
  - Saves user for push notification handling
  - Used for sending device-specific notifications

---

## User Profile (Me) Endpoints

### Base Path: `/me`

#### 1. Get Current User Profile
- **Endpoint**: `GET /me`
- **Parameters**: None
- **Response**: `UserResponse`
- **Business Logic**:
  - Retrieves current authenticated user from security context
  - Maps to UserResponse DTO
  - No permission check needed (always returns current user)

#### 2. Update Current User Profile
- **Endpoint**: `PUT /me`
- **Parameters**: 
  - **Body** (JSON): `UserEditRequest` (@Valid)
    - Updatable user fields
- **Response**: `UserResponse`
- **Business Logic**:
  - Retrieves current authenticated user
  - Maps request fields to user entity
  - Saves user to database
  - Returns updated user response

#### 3. Update Current User Picture
- **Endpoint**: `PUT /me/picture`
- **Parameters**: 
  - **Form**: `file` (MultipartFile, required) - Picture file
- **Response**: `UploadResponse`
  - Contains new picture URL
- **Business Logic**:
  - Retrieves current authenticated user
  - Uploads file to storage under "users/pictures"
  - Deletes old picture
  - Updates user picture URL
  - Returns new picture URL

#### 4. Update Current User Device Token
- **Endpoint**: `PUT /me/device-token`
- **Parameters**: 
  - **Body** (JSON): `DeviceTokenDto` (@Valid)
    - `deviceToken` (String)
    - `devicePlatform` (String)
- **Response**: `202 Accepted`
- **Business Logic**:
  - Retrieves current authenticated user
  - Updates device token and platform
  - Saves for push notification routing

#### 5. Update Current User Location
- **Endpoint**: `PUT /me/location`
- **Parameters**: 
  - **Body** (JSON): `UserLocationDto` (@Valid)
    - `latitude` (BigDecimal, required) - Latitude coordinate
    - `longitude` (BigDecimal, required) - Longitude coordinate
- **Response**: `202 Accepted`
- **Business Logic**:
  - Retrieves current authenticated user
  - Delegates to UserLocationService.updateUserLocation()
  - Updates user's current location in database
  - Used for nearby users/events functionality

#### 6. Delete User Account
- **Endpoint**: `DELETE /me/deleteAccount`
- **Parameters**: None
- **Response**: `202 Accepted`
- **Business Logic**:
  - Retrieves current authenticated user
  - Delegates to UserDeleteService.deleteUser()
  - Performs cascade deletion:
    - Removes user from database
    - Deletes associated data (locations, favorites, blocks, etc.)
    - Removes user from caches
  - Account cannot be recovered

---

## Event Endpoints

### Base Path: `/events`

#### 1. Find Nearby Events
- **Endpoint**: `GET /events`
- **Parameters**: 
  - **Query**: `radius` (Double, required) - Search radius
  - **Query**: `unit` (DistanceUnit, optional, default="kilometer") - Distance unit (kilometer/mile)
- **Response**: `List<NearbyEventResponse>`
- **Business Logic**:
  - Retrieves current authenticated user's last location
  - Converts radius to kilometers based on unit parameter
  - Queries database for approved events within radius
  - Uses geolocation utils to calculate edge boundaries for efficient SQL query
  - Returns empty list if user has no location
  - Calculates distance to each event
  - Returns sorted by distance

#### 2. Get Event Details
- **Endpoint**: `GET /events/{eventId}`
- **Parameters**: 
  - **Path**: `eventId` (Long, @NotNull) - Event ID
- **Response**: `EventResponse`
- **Business Logic**:
  - Retrieves approved event by ID
  - Throws `NotFoundException` if not found
  - Maps event to response DTO
  - Only approved events are visible

#### 3. Create Event
- **Endpoint**: `POST /events`
- **Parameters**: 
  - **Body** (JSON): `EventRequest` (@Valid)
    - `name` (String) - Event name
    - `startTime` (LocalDateTime) - Event start time
    - `endTime` (LocalDateTime) - Event end time
    - `address` (Object):
      - `name` (String) - Address name
      - `latitude` (Double) - Latitude coordinate
      - `longitude` (Double) - Longitude coordinate
    - `description` (String) - Event description
    - `website` (String) - Event website URL
- **Response**: `EventResponse`
- **Business Logic**:
  - Retrieves current authenticated user ID
  - Creates new Event entity with:
    - Provided event details
    - `createdBy` = current user ID
    - `createdAt` = current timestamp
    - `status` = PENDING (awaits approval)
  - Saves to database
  - Returns created event with ID

#### 4. Upload Event Picture
- **Endpoint**: `PUT /events/{eventId}/picture`
- **Parameters**: 
  - **Path**: `eventId` (Long, @NotNull) - Event ID
  - **Form**: `file` (MultipartFile, required) - Picture file
- **Response**: `UploadResponse`
  - Contains new picture URL
- **Business Logic**:
  - Retrieves event by ID
  - Validates that requesting user is event creator
  - Uploads file to storage under "events/pictures"
  - Deletes old picture if exists
  - Updates event picture URL
  - Saves event
  - Throws `RequestForbiddenException` if not event creator

#### 5. Update Event
- **Endpoint**: `PUT /events/{eventId}`
- **Parameters**: 
  - **Path**: `eventId` (Long, @NotNull) - Event ID
  - **Body** (JSON): `EventRequest` (@Valid)
    - Same as create event fields
- **Response**: `EventResponse`
- **Business Logic**:
  - Retrieves event by ID
  - Validates that requesting user is event creator
  - Updates all event fields:
    - name, startTime, endTime
    - address (name, latitude, longitude)
    - description, website
  - Sets `updatedBy` = current user ID
  - Sets `updatedAt` = current timestamp
  - Saves event
  - Throws `RequestForbiddenException` if not event creator

#### 6. Delete Event
- **Endpoint**: `DELETE /events/{eventId}`
- **Parameters**: 
  - **Path**: `eventId` (Long, @NotNull) - Event ID
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves event by ID
  - Validates that requesting user is event creator (assumed in service)
  - Marks event as deleted (soft delete) or hard deletes from database
  - Throws `RequestForbiddenException` if not event creator

---

## Event Report Endpoints

### Base Path: `/events/reports`

#### 1. Report Event
- **Endpoint**: `POST /events/reports`
- **Parameters**: 
  - **Body** (JSON): `EventReportRequest` (@Valid)
    - `eventId` (Long) - ID of event to report
    - `reason` (String) - Reason for reporting (inappropriate, spam, etc.)
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user
  - Records event report with:
    - Reporter user ID
    - Target event ID
    - Report reason
    - Timestamp
  - Saves report to database
  - Used for moderation: events with multiple reports can be flagged/removed
  - Does not delete event immediately (goes through moderation)

---

## Nearby Users Endpoints

### Base Path: `/users-nearby`

#### 1. Get Nearby Users
- **Endpoint**: `GET /users-nearby`
- **Parameters**: 
  - **Query**: `radius` (Double, required) - Search radius
  - **Query**: `unit` (DistanceUnit, optional, default="kilometer") - Distance unit
- **Response**: `List<NearbyUserResponse>`
- **Business Logic**:
  - Retrieves current authenticated user's last location
  - Returns empty list if user has no location
  - Converts radius to kilometers
  - Queries location groups table for users within radius
  - Filters by time range (default: last configured time-range minutes)
  - Calculates minimum/maximum latitude/longitude boundaries for efficient queries
  - Logs nearby user encounters via NearbyUsersLogService
  - Returns list of nearby users with distance info
  - Does NOT return blocked users or users who blocked current user

#### 2. Get Nearby Users History
- **Endpoint**: `GET /users-nearby/history/users`
- **Parameters**: None
- **Response**: `List<NearbyHistoryEntry>`
- **Business Logic**:
  - Retrieves current authenticated user
  - Queries distinct nearby users from history
  - Returns only users with ACTIVE status
  - Shows all users encountered nearby historically (not just recent)
  - Each entry contains user info and encounter timestamps

#### 3. Get Nearby User Specific History
- **Endpoint**: `GET /users-nearby/history/users/{userId}`
- **Parameters**: 
  - **Path**: `userId` (Long, @NotNull) - Target user ID
- **Response**: `List<NearbyUserResponse>`
- **Business Logic**:
  - Retrieves current authenticated user
  - Retrieves target user (throws `NotFoundException` if not found)
  - Queries all nearby encounters with specific user
  - Returns list of encounters with that user
  - Filters by ACTIVE status only

#### 4. Delete Nearby User History
- **Endpoint**: `DELETE /users-nearby/history/users/{userId}`
- **Parameters**: 
  - **Path**: `userId` (Long, @NotNull) - Target user ID
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user
  - Retrieves target user (throws `NotFoundException` if not found)
  - Deletes all nearby history entries between current user and target user
  - Can delete individual user history without affecting other encounters

---

## User Block Endpoints

### Base Path: `/users/blocks`

#### 1. Block User
- **Endpoint**: `POST /users/blocks`
- **Parameters**: 
  - **Body** (JSON): `UserBlockRequest` (@Valid)
    - `blockedUserId` (Long) - ID of user to block
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user (blocker)
  - Extracts blocked user ID from request
  - Creates block record in database with:
    - Blocker user ID
    - Blocked user ID
    - Block timestamp
  - Blocked user:
    - Will not appear in nearby users search
    - Will not see current user in nearby users search (bidirectional)
    - Cannot interact with current user

#### 2. Unblock User
- **Endpoint**: `DELETE /users/blocks/{blockedUserId}`
- **Parameters**: 
  - **Path**: `blockedUserId` (Long, @NotNull) - ID of user to unblock
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user (blocker)
  - Finds and removes block record between blocker and blocked user
  - After unblocking:
    - Blocked user can appear in nearby search again
    - Can resume interactions

---

## User Favorites Endpoints

### Base Path: `/users/favorites`

#### 1. Add Favorite User
- **Endpoint**: `POST /users/favorites`
- **Parameters**: 
  - **Body** (JSON): `UserFavoriteRequest` (@Valid)
    - `favoriteUserId` (Long) - ID of user to add as favorite
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user
  - Adds specified user to favorites
  - Creates favorite record in database
  - Favorite users are flagged/starred for quick access
  - Does not affect blocking or visibility

#### 2. List Favorite Users
- **Endpoint**: `GET /users/favorites`
- **Parameters**: None
- **Response**: `List<UserSearchResponse>`
- **Business Logic**:
  - Retrieves current authenticated user
  - Queries all users marked as favorites
  - Returns list of favorite users
  - Can be used to display starred users in UI

#### 3. Remove Favorite User
- **Endpoint**: `DELETE /users/favorites/{favoriteUserId}`
- **Parameters**: 
  - **Path**: `favoriteUserId` (Long, @NotNull) - ID of user to remove from favorites
- **Response**: `204 No Content`
- **Business Logic**:
  - Retrieves current authenticated user
  - Removes specified user from favorites
  - Deletes favorite record from database
  - User is still visible in search/nearby

---

## Chat/Applozic Endpoints

### Base Path: `/chat/applozic`

#### 1. Save Chat Message (Webhook)
- **Endpoint**: `POST /chat/applozic/messages`
- **Parameters**: 
  - **Body** (JSON): `Message` - Applozic message object
  - **Header**: `Authentication` (required) - Basic auth header with token
    - Format: `Basic {base64_encoded_token}`
- **Response**: `204 No Content`
- **Business Logic**:
  - Validates authentication header:
    - Must start with "Basic "
    - Base64 decoded value must equal configured `applozic.webhook.token`
  - Parses incoming message from Applozic webhook
  - Saves message to database via ChatApplozicService
  - Used for receiving messages from external Applozic chat service
  - Throws `AuthenticationException` if:
    - Header missing or invalid format
    - Token mismatch

#### 2. Authenticate Chat User
- **Endpoint**: `POST /chat/applozic/auth`
- **Parameters**: 
  - **Query**: `userId` (Long, @NotNull) - User ID
  - **Query**: `token` (@NotBlank) - User authentication token
- **Response**: `boolean`
- **Business Logic**:
  - Validates user exists and token matches
  - Delegates to ChatApplozicService.authenticate()
  - Returns true if user and token are valid
  - Returns false if invalid
  - Used by Applozic to verify user authentication

---

## Index Endpoint

### Base Path: `/`

#### 1. Health Check / Ping
- **Endpoint**: `GET /`
- **Parameters**: None
- **Response**: `String` - "Zootch"
- **Business Logic**:
  - Simple health check endpoint
  - Returns application name
  - Used to verify API is running and responsive
  - No authentication required

---

## Data Transfer Objects (DTOs) Reference

### Authentication DTOs

#### FacebookAuthRequest
```json
{
  "fbToken": "string (required, not blank)"
}
```

#### AppleAuthRequest
```json
{
  "appleToken": "string (required, not blank)"
}
```

#### PhoneOtpRequest
```json
{
  "phoneNumber": "string (required, not blank)",
  "fbToken": "string (optional, max 500 chars)",
  "appleToken": "string (optional, max 1000 chars)"
}
```

#### PhoneAuthRequest
```json
{
  "phoneNumber": "string (required, not blank, pattern: ^\\+\\d{6,15}$)",
  "otp": "string (required, exactly 4 digits)"
}
```

#### AuthResponse
```json
{
  "accessToken": "string - JWT access token",
  "refreshToken": "string - JWT refresh token",
  "user": {
    "id": "long",
    "status": "ACTIVE|BLOCKED|INACTIVE",
    "name": "string",
    "email": "string",
    "phone": "string",
    "fbId": "long (facebook ID)",
    "appleId": "string (apple ID)",
    "pictureUrl": "string",
    "isPublic": "boolean",
    "bio": "string",
    "chatToken": "string"
  },
  "otpRequired": "boolean (default: false)"
}
```

#### TokenRefreshResponse
```json
{
  "accessToken": "string - New JWT access token"
}
```

### User DTOs

#### UserEditRequest
```json
{
  "name": "string (optional)",
  "email": "string (optional, valid email, max 100 chars)",
  "pictureUrl": "string (optional, valid URL)",
  "isPublic": "boolean (required)",
  "bio": "string (optional)"
}
```

#### UserLocationDto
```json
{
  "latitude": "number (required, BigDecimal - precision to 10 decimal places)",
  "longitude": "number (required, BigDecimal - precision to 10 decimal places)"
}
```

#### DeviceTokenDto
```json
{
  "deviceToken": "string (required, not blank)",
  "devicePlatform": "enum: ANDROID | IOS (required)"
}
```

#### UserBlockRequest
```json
{
  "userId": "long (required - ID of user to block)",
  "reason": "enum: NO_REASON | BAD_BEHAVIOUR | FAKE_PROFILE | PICTURE | SCAM | UNDERAGE | OTHER (required)",
  "description": "string (optional - additional description of block reason)"
}
```

#### UserFavoriteRequest
```json
{
  "favoriteUserId": "long (required - ID of user to add as favorite)"
}
```

#### UserResponse
```json
{
  "id": "long",
  "status": "enum: ACTIVE | BLOCKED | INACTIVE",
  "name": "string",
  "email": "string",
  "phone": "string",
  "fbId": "long",
  "appleId": "string",
  "pictureUrl": "string",
  "isPublic": "boolean",
  "bio": "string",
  "chatToken": "string"
}
```

#### UserSearchResponse
```json
{
  "id": "long",
  "name": "string",
  "pictureUrl": "string",
  "bio": "string"
}
```

#### UploadResponse
```json
{
  "url": "string - URL of uploaded file"
}
```

### Event DTOs

#### EventRequest
```json
{
  "name": "string (required, not blank)",
  "startTime": "datetime (required, ISO 8601 format)",
  "endTime": "datetime (required, ISO 8601 format)",
  "address": {
    "name": "string (required, not blank)",
    "latitude": "number (required)",
    "longitude": "number (required)"
  },
  "description": "string (optional)",
  "website": "string (optional, valid URL)"
}
```

#### EventResponse
```json
{
  "id": "long",
  "createdBy": "long - User ID of event creator",
  "name": "string",
  "startTime": "datetime (ISO 8601)",
  "endTime": "datetime (ISO 8601)",
  "address": {
    "name": "string",
    "latitude": "number",
    "longitude": "number"
  },
  "description": "string",
  "website": "string",
  "pictureUrl": "string"
}
```

#### EventReportRequest
```json
{
  "eventId": "long (required)",
  "reason": "string (required, not blank - reason for reporting)"
}
```

#### NearbyEventResponse
```json
{
  "distance": "number - Distance in kilometers from user location",
  "event": {
    "id": "long",
    "createdBy": "long",
    "name": "string",
    "startTime": "datetime",
    "endTime": "datetime",
    "address": {
      "name": "string",
      "latitude": "number",
      "longitude": "number"
    },
    "description": "string",
    "website": "string",
    "pictureUrl": "string"
  }
}
```

### Nearby Users DTOs

#### NearbyUserResponse
```json
{
  "id": "long - User ID (JSON property: id)",
  "name": "string - User name (JSON property: name)",
  "pictureUrl": "string - User picture URL (JSON property: pictureUrl)",
  "bio": "string - User bio (JSON property: bio)",
  "latitude": "number - User latitude (JSON property: latitude)",
  "longitude": "number - User longitude (JSON property: longitude)",
  "distance": "number - Distance in kilometers (JSON property: distance)",
  "locationReportedTime": "datetime - When location was last reported (ISO 8601, JSON property: locationReportedTime)"
}
```

#### NearbyHistoryEntry
```json
{
  "id": "long - User ID",
  "name": "string - User name",
  "pictureUrl": "string - User picture URL",
  "bio": "string - User bio"
}
```

### Enums

#### DevicePlatform
```
ANDROID
IOS
```

#### UserBlockReason
```
NO_REASON
BAD_BEHAVIOUR
FAKE_PROFILE
PICTURE
SCAM
UNDERAGE
OTHER
```

#### DistanceUnit
```
kilometer (default, value: 1.0)
mile (value: 1.60934)
```

---

## Security & Authentication

- **Authentication Method**: JWT Bearer Token
- **Token Header**: `Authorization: Bearer {token}`
- **Token Types**:
  - **Access Token**: For API requests (shorter expiration)
  - **Refresh Token**: For token refresh endpoint (longer expiration)
  - **Refresh Token Scope**: "REFRESH_TOKEN_SCOPE"
- **Permission Model**: 
  - Users can only modify their own data
  - Event creators can only modify/delete their own events
  - Endpoints validate current user matches target user ID
  - `RequestForbiddenException` thrown on unauthorized access

## Caching Strategy

- **User Cache**: Active users cached after queries
- **Location Group Cache**: User location groups cached for nearby queries
- **Cache Invalidation**:
  - When user data updated
  - When user blocked
  - When user deleted
  - Cache keys by user ID and location group ID

## Rate Limiting

- **Phone OTP Endpoint** has aggressive rate limiting:
  - Per phone number: 5 requests per 2 minutes
  - Per IP address: 10 requests per day
  - Global: 1 request per 5 seconds
  - Uses token bucket algorithm
  - Errors returned with specific error codes

## File Upload

- **Picture Uploads**:
  - User pictures: stored in `users/pictures/` directory
  - Event pictures: stored in `events/pictures/` directory
  - Old files deleted when updated
  - File validation performed via MultipartFile
  - Returns URL of uploaded file

## Geolocation Features

- **Nearby Users/Events Search**:
  - Uses user's last location
  - Calculates search radius with distance unit conversion (km/miles)
  - Efficient SQL queries using latitude/longitude bounding boxes
  - Proximity calculation for sorting results
  - Requires user location update via `/me/location` endpoint
