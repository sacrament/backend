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

// Store for rate limiting (in production, use Redis)
const rateLimitStore = new Map();

// Global SMS budget: max OTPs per hour across all IPs/phones
const globalOtpBudget = { count: 0, resetAt: Date.now() + 60 * 60 * 1000 };
const GLOBAL_OTP_MAX_PER_HOUR = parseInt(process.env.OTP_GLOBAL_HOURLY_LIMIT) || 500;

/**
 * Apple Authentication
 * POST /auth/apple
 */
const appleAuth = async (req, res) => {
  try {
    const { appleToken } = req.body;

    if (!appleToken || appleToken.trim() === '') {
      return res.status(400).json({ status: 'error', code: 1001, message: 'Apple token is required and cannot be blank' });
    }

    const { user, accessToken, refreshToken, clientToken } = await authService.authenticateApple(appleToken);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: formatUserResponse(user),
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    console.error('Apple auth error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Google Authentication (Android)
 * POST /auth/google
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken || idToken.trim() === '') {
      return res.status(400).json({ status: 'error', code: 1019, message: 'Google ID token is required' });
    }

    const { user, accessToken, refreshToken, clientToken } = await authService.authenticateGoogle(idToken);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: formatUserResponse(user),
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    console.error('Google auth error:', error);
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

    const currentClientCode = process.env.OTP_CLIENT_KEY_CODE;

    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({ status: 'error', code: 1011, message: 'Phone number is required' });
    }

    if (!/^\+\d{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ status: 'error', code: 1012, message: 'Invalid phone number format' });
    }

    if (phoneNumber.startsWith('+233') || phoneNumber.startsWith('+4474') || phoneNumber.startsWith('+23')) {
      const code = phoneNumber.startsWith('+233') ? 9002 : phoneNumber.startsWith('+4474') ? 9003 : 9004;
      return res.status(400).json({ status: 'error', code, message: 'Phone number from this region is not allowed' });
    }

    if (!signature) {
      return res.status(400).json({ status: 'error', code: 1002, message: 'Missing signature header' });
    }

    // HMAC-SHA256 with time window when OTP_SIGNATURE_SECRET is set (requires mobile update).
    // Falls back to legacy SHA1 if secret is not configured.
    const sigSecret = process.env.OTP_SIGNATURE_SECRET;
    let signatureValid = false;
    if (sigSecret) {
      const minute = Math.floor(Date.now() / 60000);
      const expected = crypto.createHmac('sha256', sigSecret).update(`${phoneNumber}:${minute}`).digest('hex');
      const expectedPrev = crypto.createHmac('sha256', sigSecret).update(`${phoneNumber}:${minute - 1}`).digest('hex');
      signatureValid = signature === expected || signature === expectedPrev;
    } else {
      const legacyExpected = crypto
        .createHash('sha1')
        .update(`VerifySignatureCodeWithWithClientKeyFor=${phoneNumber}`)
        .digest('hex');
      signatureValid = signature === legacyExpected;
    }

    if (!signatureValid) {
      return res.status(400).json({ status: 'error', code: 1103, message: 'Signature verification failed' });
    }

    if (!clientKeyCode) {
      return res.status(400).json({ status: 'error', code: 1005, message: 'Missing client key code header' });
    }

    if (clientKeyCode !== currentClientCode) {
      return res.status(400).json({ status: 'error', code: 1106, message: 'Invalid client key code' });
    }

    // skip for development/testing environments to allow easy OTP requests without strict client headers
    if (process.env.NODE_ENV === 'production') { 
      if (userAgent && !isValidUserAgent(userAgent)) {
        return res.status(400).json({ status: 'error', code: 1006, message: 'Missing device user agent' });
      }
    } else {
        // return res.status(400).json({ status: 'error', code: 1007, message: 'Invalid device user agent' });
      
    }

    const rateLimitKey = `phone_${phoneNumber}`;
    const ipLimitKey = `ip_${clientIp}`;

    if (!checkGlobalOtpBudget()) {
      return res.status(429).json({ status: 'error', code: 3132, message: 'Service temporarily unavailable, please try again later' });
    }

    if (!checkRateLimit(rateLimitKey, 3, 10 * 60).allowed) {
      return res.status(429).json({ status: 'error', code: 3129, message: 'Rate limit exceeded for phone number' });
    }

    if (!checkRateLimit(ipLimitKey, 5, 24 * 60 * 60).allowed) {
      return res.status(429).json({ status: 'error', code: 9213, message: 'Rate limit exceeded for IP address' });
    }

    await authService.requestOtp(phoneNumber, { userAgent, ip: clientIp });

    return res.status(202).json({ status: 'success', message: 'OTP sent to phone number', otpSent: true });

  } catch (error) {
    if (error.code === 3133) {
      return res.status(429).json({ status: 'error', code: 3133, message: error.message });
    }
    console.error('Phone OTP request error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

/**
 * Phone Authentication with OTP
 * POST /auth/phone
 */
const phoneAuth = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !/^\+\d{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ status: 'error', code: 1012, message: 'Invalid phone number format' });
    }

    if (!otp || !/^\d{4}$/.test(otp)) {
      return res.status(400).json({ status: 'error', code: 1013, message: 'OTP must be exactly 4 digits' });
    }

    const { user, accessToken, refreshToken, clientToken } = await authService.authenticatePhone(phoneNumber, otp);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      clientToken,
      user: user,
      otpRequired: false
    });

  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ status: 'error', code: error.code, message: error.message });
    }
    console.error('Phone auth error:', error);
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
    console.error('Token refresh error:', error);
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
      const user = await userService.getUserById(userId);

      await Promise.all([
        userService.clearRefreshToken(userId),
        user?.device
          ? deviceService.disableDevice(user.device._id?.toString() ?? user.device.toString(), userId)
          : Promise.resolve(),
      ]);
    }

    return res.status(200).json({ status: 'success', message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ status: 'error', code: 5000, message: 'Internal server error' });
  }
};

// ============= Helper Functions =============

function isValidUserAgent(userAgent) {
  return /iOS|Android/i.test(userAgent);
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

function formatUserResponse(user) {
  return {
    id: user._id.toString(),
    status: user.status || 'active',
    name: user.name || '',
    email: user.email || null,
    fbId: user.facebookId || null,
    appleId: user.appleId || null,
    pictureUrl: user.imageUrl || null,
    isPublic: user.isPublic || false,
    bio: user.bio || null,
    chatToken: user.chatToken || null
  };
}

module.exports = { appleAuth, googleAuth, requestPhoneOtp, phoneAuth, refreshToken, logout };
