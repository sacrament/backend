/**
 * Apple Token Revocation
 * POST /api/auth/apple/revoke
 * 
 * Supports multiple authentication flows:
 * 1. Authenticated: Authorization: Bearer <accessToken> header
 * 2. With Apple ID: Body contains { appleUserId: "...", appleRefreshToken?: "...", appleAccessToken?: "..." }
 * 3. Direct tokens: Body contains { appleRefreshToken: "...", appleAccessToken: "..." } (requires appleUserId for user lookup)
 */
const appleRevoke = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;
    const appleUserId = req.body?.appleUserId;
    
    logger.info(`Apple revoke: Attempting revoke. userId from token=${userId}, appleUserId from body=${appleUserId}`);
    
    if (!userId && !appleUserId) {
      logger.warn(`Apple revoke: Neither userId (from auth token) nor appleUserId (from body) provided. Request must include either: (1) Authorization: Bearer <token> header, or (2) appleUserId in request body`);
      return res.status(400).json({
        status: 'error',
        message: 'Authentication required. Provide either: (1) Authorization header with session token, or (2) appleUserId in request body'
      });
    }
    
    const user = userId
      ? await userService.model.findById(userId)
      : await userService.model.findOne({ appleId: appleUserId });

    if (!user) {
      logger.warn(`Apple revoke: User lookup failed. Searched for userId=${userId} or appleId=${appleUserId}. Found: null`);
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    logger.info(`Apple revoke: Found user ${user._id} (appleId=${user.appleId})`);

    // Gather tokens from request body or user document (in priority order)
    const refreshTokenToRevoke =
      req.body?.appleRefreshToken ||
      req.body?.refreshToken ||
      req.body?.refresh_token ||
      user.appleRefreshToken;

    const accessTokenToRevoke =
      req.body?.appleAccessToken ||
      req.body?.accessToken ||
      req.body?.access_token ||
      req.body?.appleToken ||
      req.body?.idToken ||
      req.body?.identityToken ||
      user.appleAccessToken;

    // Build candidates from stored tokens only
    // NOTE: Do NOT exchange authorization codes in revoke — they are single-use and belong in sign-in only
    const tokenCandidates = [];
    if (refreshTokenToRevoke) tokenCandidates.push({ token: refreshTokenToRevoke, tokenTypeHint: 'refresh_token' });
    if (accessTokenToRevoke) tokenCandidates.push({ token: accessTokenToRevoke, tokenTypeHint: 'access_token' });

    if (tokenCandidates.length === 0) {
      logger.warn(`Apple revoke: No tokens available to revoke. User ${user._id} has: refresh=${!!user.appleRefreshToken}, access=${!!user.appleAccessToken}. iOS must pass tokens via body or user must have signed in with authorization code exchange.`);
      return res.status(400).json({
        status: 'error',
        message: 'No Apple tokens found. Pass appleRefreshToken/appleAccessToken in request body, or ensure user signed in with authorization code.'
      });
    }

    await authService.revokeAppleTokens(tokenCandidates);

    user.appleAccessToken = null;
    user.appleRefreshToken = null;
    user.appleId = null;
    user.updatedOn = new Date();
    await user.save();

    return res.status(200).json({ status: 'success', message: 'Apple account revoked and unlinked' });
  } catch (error) {
    logger.error('Apple revoke error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to revoke Apple token' });
  }
};
/**
 * Authentication Controller
 * Handles user authentication logic for Facebook, Apple, and Phone OTP
 */

const crypto = require('crypto');
const UserService   = require('../../services/domain/user/user.service');
const DeviceService = require('../../services/domain/device/device.service');
const userService   = new UserService();
const deviceService = new DeviceService();
const { newToken } = require('../../middleware/verify');
const authService = require('../../services/domain/auth/auth.service');
const logger = require('../../utils/logger');

// Store for rate limiting (in production, use Redis)
const rateLimitStore = new Map();

// Global SMS budget: max OTPs per hour across all IPs/phones. This is the last
// backstop on Twilio spend, so the default is a number we can afford to pay for
// rather than a number we expect to reach — raise it deliberately via env as
// real signup volume grows.
const globalOtpBudget = { count: 0, resetAt: Date.now() + 60 * 60 * 1000 };
const GLOBAL_OTP_MAX_PER_HOUR = parseInt(process.env.OTP_GLOBAL_HOURLY_LIMIT) || 2000;

// Short-window per-phone cap, layered under the hourly limiter in routes/index.js.
// Stops a burst against one victim's handset between hourly window resets.
const OTP_MAX_PER_PHONE_PER_10MIN = parseInt(process.env.OTP_MAX_PER_PHONE_PER_10MIN) || 3;

/**
 * Apple Authentication
 * POST /auth/apple
 */
const appleAuth = async (req, res) => {
  try {
    const { appleToken, email, name, deviceId } = req.body;
    const appleAccessToken = req.body?.appleAccessToken || req.body?.accessToken || req.body?.access_token || null;
    const appleRefreshToken = req.body?.appleRefreshToken || req.body?.refreshToken || req.body?.refresh_token || null;
    const appleAuthorizationCode = req.body?.appleAuthorizationCode || req.body?.authorizationCode || req.body?.authorization_code || null;

    if (!appleToken || appleToken.trim() === '') {
      return res.status(400).json({ status: 'error', code: 1001, message: 'Apple token is required and cannot be blank' });
    }

    const { user, accessToken, refreshToken, clientToken, accountExisted } = await authService.authenticateApple(
      appleToken,
      email,
      name,
      appleAccessToken || appleToken || null,
      appleRefreshToken || null,
      appleAuthorizationCode || null,
      deviceId || null
    );

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: formatUserResponse(user),
      hasAccount: accountExisted,
      profileComplete: isProfileComplete(user),
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    logger.error('Apple auth error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Google Authentication (Android)
 * POST /auth/google
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken, deviceId } = req.body;

    if (!idToken || idToken.trim() === '') {
      return res.status(400).json({ status: 'error', code: 1019, message: 'Google ID token is required' });
    }

    const { user, accountExisted: googleAccountExisted, accessToken, refreshToken, clientToken } = await authService.authenticateGoogle(idToken, deviceId || null);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: formatUserResponse(user),
      hasAccount: googleAccountExisted,
      profileComplete: isProfileComplete(user),
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    logger.error('Google auth error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Request Phone OTP (Secured)
 * POST /auth/phone/secured
 */
const requestPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const signature = req.headers['signature-winky-code'];
    const clientKeyCode = req.headers['client-winky-keycode'];
    const userAgent = req.headers['user-agent'];
    const clientIp = req.ip || req.connection.remoteAddress;

    logger.info(`[requestPhoneOtp] Incoming OTP request - phone: ${phoneNumber}, ip: ${clientIp}, userAgent: ${userAgent}`);

    const currentClientCode = otpClientKeyCodes();

    if (!phoneNumber || phoneNumber.trim() === '') {
      logger.warn('[requestPhoneOtp] Rejected: missing phone number');
      return res.status(400).json({ status: 'error', code: 1011, message: 'Phone number is required' });
    }

    if (!/^\+\d{8,15}$/.test(phoneNumber)) {
      logger.warn(`[requestPhoneOtp] Rejected: invalid phone format - ${phoneNumber}`);
      return res.status(400).json({ status: 'error', code: 1012, message: 'Invalid phone number format. Must be in E.164 format (e.g. +14165550000)' });
    }

    if (phoneNumber.startsWith('+233') || phoneNumber.startsWith('+4474') || phoneNumber.startsWith('+23')) {
      const code = phoneNumber.startsWith('+233') ? 9002 : phoneNumber.startsWith('+4474') ? 9003 : 9004;
      logger.warn(`[requestPhoneOtp] Rejected: blocked region - phone: ${phoneNumber}, code: ${code}`);
      return res.status(400).json({ status: 'error', code, message: 'Phone number from this region is not allowed' });
    }

    if (!signature) {
      logger.warn(`[requestPhoneOtp] Rejected: missing signature header - phone: ${phoneNumber}`);
      return res.status(400).json({ status: 'error', code: 1002, message: 'Missing signature header' });
    }

    // HMAC-SHA256 over `phone:minute`, accepting the previous minute for clock skew.
    //
    // The legacy branch below is a SHA1 of a hardcoded string plus the phone number,
    // with no secret in it at all — anyone who has seen the source or one request can
    // compute it. It therefore only runs when explicitly opted into via
    // OTP_ALLOW_LEGACY_SIGNATURE, for draining traffic from old mobile builds. With
    // no secret configured and no opt-in we fail closed rather than silently serving
    // an endpoint that has no signature protection.
    const sigSecrets = otpSignatureSecrets();
    const allowLegacySignature = process.env.OTP_ALLOW_LEGACY_SIGNATURE === 'true';
    let signatureValid = false;

    if (sigSecrets.length > 0) {
      const minute = Math.floor(Date.now() / 60000);
      // Try each accepted secret against this minute and the previous one (clock skew).
      // Index 0 is the current secret; anything beyond it is a retiring secret still in
      // circulation. `matchedIndex` tells us which, so the logs show when old builds
      // have drained and the retiring secret can safely be dropped.
      let matchedIndex = -1;
      for (let i = 0; i < sigSecrets.length; i++) {
        const expected     = crypto.createHmac('sha256', sigSecrets[i]).update(`${phoneNumber}:${minute}`).digest('hex');
        const expectedPrev = crypto.createHmac('sha256', sigSecrets[i]).update(`${phoneNumber}:${minute - 1}`).digest('hex');
        if (timingSafeEqualHex(signature, expected) || timingSafeEqualHex(signature, expectedPrev)) {
          matchedIndex = i;
          signatureValid = true;
          break;
        }
      }
      if (matchedIndex > 0) {
        logger.warn(`[requestPhoneOtp] Signature matched a RETIRING secret (slot ${matchedIndex}) — an old client build is still in use. phone: ${phoneNumber}`);
      } else {
        logger.info(`[requestPhoneOtp] Signature check (HMAC-SHA256) - valid: ${signatureValid}, phone: ${phoneNumber}`);
      }
    } else if (allowLegacySignature) {
      const legacyExpected = crypto
        .createHash('sha1')
        .update(`VerifySignatureCodeWithWithClientKeyFor=${phoneNumber}`)
        .digest('hex');
      signatureValid = timingSafeEqualHex(signature, legacyExpected);
      logger.warn(`[requestPhoneOtp] Signature check (legacy SHA1, NO SECRET) - valid: ${signatureValid}, phone: ${phoneNumber}`);
    } else {
      logger.error('[requestPhoneOtp] OTP_SIGNATURE_SECRET is not configured and legacy signatures are not enabled — rejecting all OTP requests');
      return res.status(503).json({ status: 'error', code: 5001, message: 'Service temporarily unavailable, please try again later' });
    }

    if (!signatureValid) {
      logger.warn(`[requestPhoneOtp] Rejected: signature verification failed - phone: ${phoneNumber}`);
      return res.status(400).json({ status: 'error', code: 1103, message: 'Signature verification failed' });
    }

    if (!clientKeyCode) {
      logger.warn(`[requestPhoneOtp] Rejected: missing client key code - phone: ${phoneNumber}`);
      return res.status(400).json({ status: 'error', code: 1005, message: 'Missing client key code header' });
    }

    const clientCodeMatch = currentClientCode.findIndex((code) => timingSafeEqualUtf8(clientKeyCode, code));
    if (clientCodeMatch === -1) {
      logger.warn(`[requestPhoneOtp] Rejected: invalid client key code - phone: ${phoneNumber}`);
      return res.status(400).json({ status: 'error', code: 1106, message: 'Invalid client key code' });
    }
    if (clientCodeMatch > 0) {
      logger.warn(`[requestPhoneOtp] Client key code matched a RETIRING value (slot ${clientCodeMatch}) — an old client build is still in use. phone: ${phoneNumber}`);
    }

    // skip for development/testing environments to allow easy OTP requests without strict client headers
    if (process.env.NODE_ENV === 'production') {
      if (userAgent && !isValidUserAgent(userAgent)) {
        logger.warn(`[requestPhoneOtp] Rejected: invalid user agent - phone: ${phoneNumber}, userAgent: ${userAgent}`);
        return res.status(400).json({ status: 'error', code: 1006, message: 'Missing device user agent' });
      }
    } else {
        // return res.status(400).json({ status: 'error', code: 1007, message: 'Invalid device user agent' });

    }

    const phoneHash = crypto.createHash('sha256').update(phoneNumber).digest('hex');
    const rateLimitKey = `phone_${phoneHash}`;

    // Per-phone check runs first: checkGlobalOtpBudget() consumes budget on every
    // call, so checking it ahead of the phone cap would let rejected abuse burn
    // through the global allowance and lock out legitimate signups.
    if (!checkRateLimit(rateLimitKey, OTP_MAX_PER_PHONE_PER_10MIN, 10 * 60).allowed) {
      logger.warn(`[requestPhoneOtp] Rejected: phone rate limit exceeded - phone: ${phoneNumber}`);
      return res.status(429).json({ status: 'error', code: 3129, message: 'Rate limit exceeded for phone number' });
    }

    if (!checkGlobalOtpBudget()) {
      logger.warn(`[requestPhoneOtp] Rejected: global OTP budget exhausted - phone: ${phoneNumber}`);
      return res.status(429).json({ status: 'error', code: 3132, message: 'Service temporarily unavailable, please try again later' });
    }

    logger.info(`[requestPhoneOtp] All checks passed, sending OTP - phone: ${phoneNumber}`);
    await authService.requestOtp(phoneNumber, { userAgent, ip: clientIp });
    logger.info(`[requestPhoneOtp] OTP sent successfully - phone: ${phoneNumber}`);

    return res.status(202).json({ status: 'success', message: 'OTP sent to phone number', otpSent: true });

  } catch (error) {
    if (error.code === 3133) {
      logger.warn(`[requestPhoneOtp] Rate limit error from service: ${error.message}`);
      return res.status(429).json({ status: 'error', code: 3133, message: error.message });
    }
    if (error.httpStatus) {
      logger.warn(`[requestPhoneOtp] Service error - code: ${error.code}, message: ${error.message}`);
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    logger.error('[requestPhoneOtp] Unexpected error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Phone Authentication with OTP
 * POST /auth/phone
 */
const phoneAuth = async (req, res) => {
  try {
    const { phoneNumber, otp, deviceId } = req.body;

    if (!phoneNumber || !/^\+\d{8,15}$/.test(phoneNumber)) {
      return res.status(400).json({ status: 'error', code: 1012, message: 'Invalid phone number format. Must be in E.164 format (e.g. +14165550000)' });
    }

    if (!otp || !/^\d{4}$/.test(otp)) {
      return res.status(400).json({ status: 'error', code: 1013, message: 'OTP must be exactly 4 digits' });
    }

    const { user, accessToken, refreshToken, clientToken, accountExisted: phoneAccountExisted } = await authService.authenticatePhone(phoneNumber, otp, deviceId || null);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: formatUserResponse(user),
      hasAccount: phoneAccountExisted,
      profileComplete: isProfileComplete(user),
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    logger.error('Phone auth error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Refresh Authentication Token
 * GET /auth/token
 */
const refreshToken = async (req, res) => {
  try {
    const decodedToken = req.decodedToken;

    if (decodedToken.scope !== 'REFRESH_TOKEN_SCOPE') {
      return res.status(401).json({ status: 'error', code: 1015, message: 'Invalid token scope for refresh' });
    }

    const user = await userService.getActiveUserById(decodedToken.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ status: 'error', code: 1016, message: 'User not found or inactive' });
    }

    const newAccessToken = newToken(user._id.toString(), 'ACCESS');

    return res.status(200).json({ status: 'success', accessToken: newAccessToken });

  } catch (error) {
    logger.error('Token refresh error:', error);
    return res.status(401).json({ status: 'error', code: 1017, message: 'Token refresh failed' });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const userId = req.decodedToken?.userId;

    if (userId) {
      await Promise.all([
        userService.clearRefreshToken(userId),
        deviceService.disableAllDevicesForUser(userId),
      ]);
    }

    return res.status(200).json({ status: 'success', message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

// ============= Helper Functions =============

function isValidUserAgent(userAgent) {
  return /iOS|Android/i.test(userAgent);
}

// ─── OTP credential rotation ──────────────────────────────────────────────────
//
// A mobile build and a backend deploy cannot be swapped at the same instant: an
// App Store release rolls out over days, and users update whenever they feel like
// it. So a single-valued secret cannot actually be rotated — changing it breaks
// every client that has not updated yet.
//
// Both credentials are therefore read as an ordered list: the current value first,
// then any number of retiring values that are still accepted. Rotation becomes:
//
//   1. Generate a new secret (`npm run otp:gen-secret`).
//   2. Deploy the backend with OTP_SIGNATURE_SECRET=<new> and
//      OTP_SIGNATURE_SECRET_RETIRING=<old>. Both old and new clients work.
//   3. Ship the mobile build carrying <new>.
//   4. Watch for "matched a RETIRING secret" in the logs. When it stops, the old
//      builds are gone.
//   5. Deploy again with OTP_SIGNATURE_SECRET_RETIRING removed.
//
// Step 5 is the one that actually completes the rotation — until then the old
// secret is still valid, so a leak is not yet contained. The same applies to
// OTP_CLIENT_KEY_CODE / OTP_CLIENT_KEY_CODE_RETIRING.

/** Parse a comma-separated env var into a trimmed, non-empty list. */
function parseSecretList(value) {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
}

/** Accepted OTP signing secrets, current first, then any retiring ones. */
function otpSignatureSecrets() {
  return [
    ...parseSecretList(process.env.OTP_SIGNATURE_SECRET),
    ...parseSecretList(process.env.OTP_SIGNATURE_SECRET_RETIRING),
  ];
}

/** Accepted client key codes, current first, then any retiring ones. */
function otpClientKeyCodes() {
  return [
    ...parseSecretList(process.env.OTP_CLIENT_KEY_CODE),
    ...parseSecretList(process.env.OTP_CLIENT_KEY_CODE_RETIRING),
  ];
}

/**
 * Constant-time comparison of two hex strings. Returns false rather than throwing
 * on malformed or mismatched input, so a caller can pass an untrusted header
 * straight in. Length is compared first and is not itself secret here — both
 * sides are fixed-width digests.
 */
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Constant-time comparison of two UTF-8 strings, for shared secrets that are not hex. */
function timingSafeEqualUtf8(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkGlobalOtpBudget() {
  const now = Date.now();
  if (now > globalOtpBudget.resetAt) {
    globalOtpBudget.count = 0;
    globalOtpBudget.resetAt = now + 60 * 60 * 1000;
  }
  if (globalOtpBudget.count >= GLOBAL_OTP_MAX_PER_HOUR) return false;
  globalOtpBudget.count++;
  return true;
}

function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { requests: [now], resetTime: now + (windowSeconds * 1000) });
    return { allowed: true };
  }

  const bucket = rateLimitStore.get(key);

  if (now > bucket.resetTime) {
    bucket.requests = [now];
    bucket.resetTime = now + (windowSeconds * 1000);
    return { allowed: true };
  }

  bucket.requests = bucket.requests.filter(time => now - time < (windowSeconds * 1000));

  if (bucket.requests.length >= maxRequests) return { allowed: false };

  bucket.requests.push(now);
  return { allowed: true };
}

/**
 * A profile is considered complete when the user has supplied the minimum
 * fields required to participate in the app.  Signup only collects a
 * Display Name (photo, birthday, gender, and interests moved out of
 * onboarding); anything less means onboarding is still pending regardless
 * of whether the account record already existed.
 */
function isProfileComplete(user) {
  return !!user.name;
}

function formatUserResponse(user) {
  let phoneNumber = null;
  if (user.phone) {
    try {
      phoneNumber = userService.decryptPhone(user.phone);
    } catch (err) {
      logger.error(`decryptPhone failed for user ${user._id}: ${err.message}`);
    }
  }

  return {
    id: user._id.toString(),
    status: user.status || 'active',
    name: user.name || '',
    username: user.username || null,
    email: user.email || null,
    phone: phoneNumber,
    phoneNumber,
    fbId: user.facebookId || null,
    appleId: user.appleId || null,
    pictureUrl: user.imageUrl || null,
    isPublic: user.isPublic || false,
    bio: user.bio || null,
    chatToken: user.chatToken || null
  };
}

module.exports = { appleAuth, googleAuth, requestPhoneOtp, phoneAuth, refreshToken, logout, appleRevoke };
