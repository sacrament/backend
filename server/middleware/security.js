'use strict';

/**
 * Security Middleware
 *
 * Defends against:
 *  - Remote Code Execution (RCE) / Command Injection
 *  - Server-Side Template Injection (SSTI)
 *  - Path Traversal / Directory Traversal
 *  - Prototype Pollution
 *  - Server-Side Request Forgery (SSRF)
 *  - HTTP Parameter Pollution (via hpp package, applied in index.js)
 *  - Automated scanners, vulnerability probes and spam bots
 */

const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

// ─── Attack Pattern Catalogue ─────────────────────────────────────────────────
//
// IMPORTANT: Do NOT add the /g flag to any pattern stored in an array.
//            Shared regexes with /g keep stateful lastIndex which causes
//            false-negatives on alternating calls.

const PATTERNS = {

    // Remote Code Execution / Command Injection
    rce: [
        /\beval\s*\(/i,
        /\bnew\s+Function\s*\(/i,
        /\bexecSync\b/i,
        /\bspawnSync\b/i,
        /\bexecFileSync\b/i,
        /child_process/i,
        /process\.binding\s*\(/i,
        /require\s*\(\s*['"`]child_process/i,
        // Shell metacharacter followed by a recognisable OS command (bounded)
        /[;&|`]\s*(ls|cat|wget|curl|nc|ncat|netcat|bash|sh|zsh|python3?|perl|ruby|php|whoami|id|uname|passwd|shadow)\b/i,
        // Backtick command substitution – bounded to 200 chars to avoid ReDoS
        /`[^`]{1,200}`/,
        // $( ) command substitution – bounded
        /\$\([^)]{1,200}\)/,
    ],

    // Server-Side Template Injection (SSTI)
    ssti: [
        // Jinja2 / Twig / Nunjucks:  {{ ... }}
        /\{\{[\s\S]{0,100}\}\}/,
        // ERB:  <%= ... %>
        /<%=[\s\S]{0,100}%>/,
        // Freemarker / Velocity:  ${...} or #{...}
        /[#$]\{[\s\S]{0,100}\}/,
        // Smarty:  {php} ... {/php}
        /\{php\}[\s\S]{0,200}\{\/php\}/i,
        // Pebble / Thymeleaf number-probe payloads:  {{7*7}}, ${7*7}
        /\{\{[\d\s*+\-/%]{1,20}\}\}/,
    ],

    // Path / Directory Traversal
    pathTraversal: [
        // Raw dotdot sequences
        /\.\.[\/\\]/,
        // URL-encoded variants
        /\.\.%2[fF]/,
        /\.\.%5[cC]/,
        /\.\.%252[fF]/,      // double-encoded
        /%2[eE]%2[eE]%2[fF]/, // all dots encoded
        // Null-byte injection (often paired with traversal)
        /%00/,
        /\x00/,
    ],

    // Prototype Pollution  (check object *keys*, not values)
    protoPollution: [
        /__proto__/i,
        /constructor\s*\[/i,
        /prototype\s*\[/i,
        /constructor\.prototype/i,
    ],

    // Server-Side Request Forgery – block requests that try to hit internal
    // infrastructure via URL-valued fields in the body / query.
    ssrf: [
        // Loopback / link-local / metadata endpoints
        /https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|::1|169\.254\.169\.254)/i,
        // RFC-1918 private ranges
        /https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
        /https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/i,
        /https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/i,
        // Non-HTTP scheme abuse
        /^file:\/\//i,
        /^gopher:\/\//i,
        /^dict:\/\//i,
        /^ftp:\/\//i,
        /^ldap:\/\//i,
    ],
};

// User-Agent substrings associated with vulnerability scanners / attack tools.
// Checked case-insensitively.
const BLOCKED_AGENTS = /sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|ffuf|burpsuite|havij|acunetix|nessus|openvas|w3af|whatweb|joomscan|wpscan|metasploit|hydra|medusa|appscan|arachni|skipfish|vega\b|zap\b|owasp/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively scan every *value* in obj against one or more pattern arrays.
 * Depth-limited to avoid stack overflow on pathological payloads.
 */
function scanValues(value, patterns, depth = 0) {
    if (depth > 10) return false;

    if (typeof value === 'string') {
        return patterns.some((re) => re.test(value));
    }
    if (Array.isArray(value)) {
        return value.some((item) => scanValues(item, patterns, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
        return Object.values(value).some((v) => scanValues(v, patterns, depth + 1));
    }
    return false;
}

/**
 * Recursively scan every *key* in obj against the supplied patterns.
 */
function scanKeys(obj, patterns, depth = 0) {
    if (depth > 10 || obj === null || typeof obj !== 'object') return false;
    const keyHit = Object.keys(obj).some((key) => patterns.some((re) => re.test(key)));
    if (keyHit) return true;
    return Object.values(obj).some((v) => scanKeys(v, patterns, depth + 1));
}

/**
 * Return a sanitised string representation of the offending value for logging.
 */
function safePreview(value) {
    const str = typeof value === 'string' ? value : JSON.stringify(value) || '';
    return str.slice(0, 120);
}

/**
 * Collect the client IP, respecting the trusted proxy chain set in Express.
 */
function clientIp(req) {
    return (
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        'unknown'
    );
}

/**
 * Build a reusable middleware that scans request inputs against a set of
 * patterns and rejects the request if any match is found.
 *
 * @param {RegExp[]}  patterns  - Array of RegExp to test against
 * @param {string}    attackType - Label used in logs / response
 * @param {boolean}   keysOnly  - If true scan keys rather than values (prototype pollution)
 */
function buildPatternGuard(patterns, attackType, keysOnly = false) {
    return function patternGuard(req, res, next) {
        const targets = [req.body, req.query, req.params];
        const hit = targets.some((target) =>
            keysOnly ? scanKeys(target, patterns) : scanValues(target, patterns)
        );

        if (hit) {
            const ip      = clientIp(req);
            const preview = safePreview(
                JSON.stringify(req.body) || JSON.stringify(req.query) || ''
            );

            logger.warn(`[security] ${attackType} attempt blocked`, {
                ip,
                method : req.method,
                path   : req.path,
                preview,
            });

            return res.status(400).json({
                status  : 'error',
                code    : 400,
                message : 'Request contains disallowed content.',
            });
        }

        return next();
    };
}

// ─── Exported Middleware ──────────────────────────────────────────────────────

/**
 * Block requests from well-known vulnerability scanners and attack tools by
 * inspecting the User-Agent header.
 */
const blockScanners = (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (BLOCKED_AGENTS.test(ua)) {
        logger.warn('[security] scanner/attacker UA blocked', {
            ip: clientIp(req),
            ua: ua.slice(0, 200),
            path: req.path,
        });
        return res.status(403).json({
            status  : 'error',
            code    : 403,
            message : 'Forbidden.',
        });
    }
    return next();
};

/**
 * Detect RCE / command-injection payloads in request inputs.
 */
const rceProtection = buildPatternGuard(PATTERNS.rce, 'RCE');

/**
 * Detect Server-Side Template Injection payloads.
 */
const sstiProtection = buildPatternGuard(PATTERNS.ssti, 'SSTI');

/**
 * Detect path / directory traversal payloads.
 */
const pathTraversalProtection = buildPatternGuard(PATTERNS.pathTraversal, 'PathTraversal');

/**
 * Detect prototype-pollution payloads by inspecting object *keys*.
 */
const protoPollutionProtection = buildPatternGuard(
    PATTERNS.protoPollution,
    'PrototypePollution',
    true   // scan keys, not values
);

/**
 * Detect SSRF payloads – strings that reference internal / private addresses.
 */
const ssrfProtection = buildPatternGuard(PATTERNS.ssrf, 'SSRF');

// ─── Endpoint-Specific Rate Limiters ─────────────────────────────────────────

/**
 * Strict rate-limiter for authentication endpoints (OTP request / verify).
 * 10 attempts per 15 minutes per IP.
 */
const authRateLimiter = rateLimit({
    windowMs       : 15 * 60 * 1000,
    max            : 10,
    keyGenerator   : (req) => clientIp(req),
    message        : {
        status  : 'error',
        code    : 429,
        message : 'Too many authentication attempts. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders  : false,
    skipSuccessfulRequests: false,
});

/**
 * Very strict rate-limiter for account-creation / registration flows.
 * 5 attempts per hour per IP.
 */
const registrationRateLimiter = rateLimit({
    windowMs       : 60 * 60 * 1000,
    max            : 5,
    keyGenerator   : (req) => clientIp(req),
    message        : {
        status  : 'error',
        code    : 429,
        message : 'Too many registration attempts. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders  : false,
});

/**
 * Moderate rate-limiter for password-reset / OTP-resend style flows.
 * 5 attempts per 10 minutes per IP.
 */
const sensitiveActionRateLimiter = rateLimit({
    windowMs       : 10 * 60 * 1000,
    max            : 5,
    keyGenerator   : (req) => clientIp(req),
    message        : {
        status  : 'error',
        code    : 429,
        message : 'Too many requests. Please wait before trying again.',
    },
    standardHeaders: true,
    legacyHeaders  : false,
});

// ─── Composite Guard ──────────────────────────────────────────────────────────

/**
 * Ordered array of all global payload-inspection middleware.
 * Apply with:  app.use('/api', ...security.globalGuards)
 */
const globalGuards = [
    blockScanners,
    rceProtection,
    sstiProtection,
    pathTraversalProtection,
    protoPollutionProtection,
    ssrfProtection,
];

module.exports = {
    blockScanners,
    rceProtection,
    sstiProtection,
    pathTraversalProtection,
    protoPollutionProtection,
    ssrfProtection,
    authRateLimiter,
    registrationRateLimiter,
    sensitiveActionRateLimiter,
    globalGuards,
};
