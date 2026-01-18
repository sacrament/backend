/**
 * Authentication Controller
 * Handles user authentication logic for Facebook, Apple, and Phone OTP
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const UserModel = mongoose.model('User');
const UserService = require('../../services/domain/user/user.service');
const config = require('../../utils/config');
const { newToken } = require('../../middleware/verify');

// Store for rate limiting (in production, use Redis)
const rateLimitStore = new Map();

/**
 * Facebook Authentication
 * POST /auth/facebook
 */
const facebookAuth = async (req, res) => {
  try {
    const { fbToken } = req.body;

    if (!fbToken || fbToken.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 1001,
        message: 'Facebook token is required and cannot be blank'
      });
    }

    const userService = new UserService(UserModel);
    
    // Validate with Facebook service
    // In production, validate token with Facebook Graph API
    const fbUser = await validateFacebookToken(fbToken);
    
    if (!fbUser) {
      return res.status(401).json({
        status: 'error',
        code: 1008,
        message: 'Invalid Facebook token'
      });
    }

    // Find or create user
    let user = await UserModel.findOne({ facebookId: fbUser.id });
    
    if (!user) {
      user = new UserModel({
        facebookId: fbUser.id,
        name: fbUser.name || 'Facebook User',
        email: fbUser.email || null,
        imageUrl: fbUser.picture?.data?.url || null,
        status: 'ACTIVE',
        registeredOn: new Date(),
        isPublic: false
      });
      await user.save();
    } else if (user.status === 'BLOCKED') {
      return res.status(403).json({
        status: 'error',
        code: 1010,
        message: 'User is blocked'
      });
    }

    // Generate tokens
    const accessToken = newToken(user._id.toString(), 'ACCESS');
    const refreshToken = newToken(user._id.toString(), 'REFRESH_TOKEN_SCOPE');

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      user: formatUserResponse(user),
      otpRequired: false
    });

  } catch (error) {
    console.error('Facebook auth error:', error);
    return res.status(500).json({
      status: 'error',
      code: 5000,
      message: 'Internal server error'
    });
  }
};

/**
 * Apple Authentication
 * POST /auth/apple
 */
const appleAuth = async (req, res) => {
  try {
    const { appleToken } = req.body;

    if (!appleToken || appleToken.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 1001,
        message: 'Apple token is required and cannot be blank'
      });
    }

    // Validate with Apple service
    // In production, validate token with Apple ID service
    const appleUser = await validateAppleToken(appleToken);
    
    if (!appleUser) {
      return res.status(401).json({
        status: 'error',
        code: 1008,
        message: 'Invalid Apple token'
      });
    }

    // Find or create user
    let user = await UserModel.findOne({ appleId: appleUser.id });
    
    if (!user) {
      user = new UserModel({
        appleId: appleUser.id,
        name: appleUser.name || 'Apple User',
        email: appleUser.email || null,
        status: 'ACTIVE',
        registeredOn: new Date(),
        isPublic: false
      });
      await user.save();
    } else if (user.status === 'BLOCKED') {
      return res.status(403).json({
        status: 'error',
        code: 1010,
        message: 'User is blocked'
      });
    }

    // Generate tokens
    const accessToken = newToken(user._id.toString(), 'ACCESS');
    const refreshToken = newToken(user._id.toString(), 'REFRESH_TOKEN_SCOPE');

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      user: formatUserResponse(user),
      otpRequired: false
    });

  } catch (error) {
    console.error('Apple auth error:', error);
    return res.status(500).json({
      status: 'error',
      code: 5000,
      message: 'Internal server error'
    });
  }
};

/**
 * Request Phone OTP (Secured)
 * POST /auth/phone/otp/new/secured
 */
const requestPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber, fbToken, appleToken } = req.body;
    const signature = req.headers['signature-zootch-code'];
    const clientKeyCode = req.headers['client-zootch-keycode'];
    const userAgent = req.headers['user-agent'];
    const clientIp = req.ip || req.connection.remoteAddress;

    // Validation: Phone number required
    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 1011,
        message: 'Phone number is required'
      });
    }

    // Validation: Block certain countries
    if (phoneNumber.startsWith('+233') || phoneNumber.startsWith('+4474') || phoneNumber.startsWith('+23')) {
      const code = phoneNumber.startsWith('+233') ? 9002 : 
                   phoneNumber.startsWith('+4474') ? 9003 : 9004;
      return res.status(400).json({
        status: 'error',
        code,
        message: `Phone number from this region is not allowed`
      });
    }

    // Validation: Signature verification
    if (!signature) {
      return res.status(400).json({
        status: 'error',
        code: 1002,
        message: 'Missing signature header'
      });
    }

    const expectedSignature = crypto
      .createHash('sha1')
      .update(config.SECRET)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({
        status: 'error',
        code: 1103,
        message: 'Signature verification failed'
      });
    }

    // Validation: Client key code
    if (!clientKeyCode) {
      return res.status(400).json({
        status: 'error',
        code: 1005,
        message: 'Missing client key code header'
      });
    }

    if (clientKeyCode !== 'VerifyZ00tchKeyCodeSignature') {
      return res.status(400).json({
        status: 'error',
        code: 1106,
        message: 'Invalid client key code'
      });
    }

    // Validation: User agent (device validation)
    if (userAgent && !isValidUserAgent(userAgent)) {
      return res.status(400).json({
        status: 'error',
        code: 1007,
        message: 'Invalid device user agent'
      });
    }

    // Rate limiting check
    const rateLimitKey = `phone_${phoneNumber}`;
    const ipLimitKey = `ip_${clientIp}`;
    
    const phoneLimitResult = checkRateLimit(rateLimitKey, 5, 2 * 60); // 5 per 2 minutes
    const ipLimitResult = checkRateLimit(ipLimitKey, 10, 24 * 60 * 60); // 10 per day

    if (!phoneLimitResult.allowed) {
      return res.status(429).json({
        status: 'error',
        code: 3129,
        message: 'Rate limit exceeded for phone number'
      });
    }

    if (!ipLimitResult.allowed) {
      return res.status(429).json({
        status: 'error',
        code: 9213,
        message: 'Rate limit exceeded for IP address'
      });
    }

    // Generate and send OTP
    const otp = generateOtp();
    
    // TODO: Send OTP via Twilio/SMS service
    // await SMSService.sendOtp(phoneNumber, otp);

    // Store OTP temporarily (in production use Redis)
    storeOtpTemporarily(phoneNumber, otp);

    return res.status(202).json({
      status: 'success',
      message: 'OTP sent to phone number'
    });

  } catch (error) {
    console.error('Phone OTP request error:', error);
    return res.status(500).json({
      status: 'error',
      code: 5000,
      message: 'Internal server error'
    });
  }
};

/**
 * Phone Authentication with OTP
 * POST /auth/phone
 */
const phoneAuth = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Validation
    if (!phoneNumber || !/^\+\d{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({
        status: 'error',
        code: 1012,
        message: 'Invalid phone number format'
      });
    }

    if (!otp || !/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        status: 'error',
        code: 1013,
        message: 'OTP must be exactly 4 digits'
      });
    }

    // Verify OTP
    const storedOtp = getStoredOtp(phoneNumber);
    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({
        status: 'error',
        code: 1014,
        message: 'Invalid or expired OTP'
      });
    }

    // Find or create user
    let user = await UserModel.findOne({ phone: phoneNumber });
    
    if (!user) {
      user = new UserModel({
        phone: phoneNumber,
        name: phoneNumber,
        status: 'ACTIVE',
        registeredOn: new Date(),
        isPublic: false
      });
      await user.save();
    } else if (user.status === 'BLOCKED') {
      return res.status(403).json({
        status: 'error',
        code: 1010,
        message: 'User is blocked'
      });
    }

    // Generate tokens
    const accessToken = newToken(user._id.toString(), 'ACCESS');
    const refreshToken = newToken(user._id.toString(), 'REFRESH_TOKEN_SCOPE');

    // Clear OTP
    clearStoredOtp(phoneNumber);

    return res.status(200).json({
      status: 'success',
      accessToken,
      refreshToken,
      user: formatUserResponse(user),
      otpRequired: false
    });

  } catch (error) {
    console.error('Phone auth error:', error);
    return res.status(500).json({
      status: 'error',
      code: 5000,
      message: 'Internal server error'
    });
  }
};

/**
 * Refresh Authentication Token
 * GET /auth/token
 */
const refreshToken = async (req, res) => {
  try {
    const decodedToken = req.decodedToken;

    // Validate that token is a refresh token
    if (decodedToken.scope !== 'REFRESH_TOKEN_SCOPE') {
      return res.status(401).json({
        status: 'error',
        code: 1015,
        message: 'Invalid token scope for refresh'
      });
    }

    // Verify user still exists and is active
    const user = await UserModel.findById(decodedToken.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        status: 'error',
        code: 1016,
        message: 'User not found or inactive'
      });
    }

    // Generate new access token
    const newAccessToken = newToken(user._id.toString(), 'ACCESS');

    return res.status(200).json({
      status: 'success',
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(401).json({
      status: 'error',
      code: 1017,
      message: 'Token refresh failed'
    });
  }
};

// ============= Helper Functions =============

/**
 * Validate Facebook token (placeholder)
 */
async function validateFacebookToken(token) {
  // In production, call Facebook Graph API
  // For now, return mock data
  return {
    id: 'fb_' + Math.random().toString(36).substr(2, 9),
    name: 'Facebook User',
    email: 'user@facebook.com',
    picture: { data: { url: null } }
  };
}

/**
 * Validate Apple token (placeholder)
 */
async function validateAppleToken(token) {
  // In production, validate with Apple ID service
  // For now, return mock data
  return {
    id: 'apple_' + Math.random().toString(36).substr(2, 9),
    name: 'Apple User',
    email: 'user@apple.com'
  };
}

/**
 * Check if user agent is valid (iOS or Android)
 */
function isValidUserAgent(userAgent) {
  return /iOS|Android/i.test(userAgent);
}

/**
 * Generate 4-digit OTP
 */
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Rate limiting with token bucket algorithm
 */
function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, {
      requests: [now],
      resetTime: now + (windowSeconds * 1000)
    });
    return { allowed: true };
  }

  const bucket = rateLimitStore.get(key);

  // Reset if window has passed
  if (now > bucket.resetTime) {
    bucket.requests = [now];
    bucket.resetTime = now + (windowSeconds * 1000);
    return { allowed: true };
  }

  // Remove old requests outside the window
  bucket.requests = bucket.requests.filter(time => now - time < (windowSeconds * 1000));

  if (bucket.requests.length >= maxRequests) {
    return { allowed: false };
  }

  bucket.requests.push(now);
  return { allowed: true };
}

/**
 * Store OTP temporarily
 */
function storeOtpTemporarily(phoneNumber, otp) {
  rateLimitStore.set(`otp_${phoneNumber}`, {
    otp,
    expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
  });
}

/**
 * Get stored OTP
 */
function getStoredOtp(phoneNumber) {
  const stored = rateLimitStore.get(`otp_${phoneNumber}`);
  if (!stored || Date.now() > stored.expiresAt) {
    return null;
  }
  return stored.otp;
}

/**
 * Clear stored OTP
 */
function clearStoredOtp(phoneNumber) {
  rateLimitStore.delete(`otp_${phoneNumber}`);
}

/**
 * Format user response
 */
function formatUserResponse(user) {
  return {
    id: user._id.toString(),
    status: user.status || 'ACTIVE',
    name: user.name || '',
    email: user.email || null,
    phone: user.phone || null,
    fbId: user.facebookId || null,
    appleId: user.appleId || null,
    pictureUrl: user.imageUrl || null,
    isPublic: user.isPublic || false,
    bio: user.bio || null,
    chatToken: user.chatToken || null
  };
}

module.exports = {
  facebookAuth,
  appleAuth,
  requestPhoneOtp,
  phoneAuth,
  refreshToken
};
