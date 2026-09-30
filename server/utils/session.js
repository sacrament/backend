/**
 * Login sessions. Each sign-in (and each logout) stamps User.sessionStartedAt;
 * tokens issued before that moment belong to a session that was replaced
 * (signed in on another phone) or ended (logged out) and are rejected.
 */

/** Now, floored to whole seconds: JWT `iat` is in seconds, so a token signed in
 *  the same second as the sign-in still counts as part of that session. */
function sessionStartNow() {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/** True when `decoded` (a verified JWT) was issued before the user's current
 *  session began. Users with no sessionStartedAt yet (signed in before this
 *  check existed) are never rejected, so deploying it logs nobody out. */
function isSessionReplaced(decoded, sessionStartedAt) {
    if (!sessionStartedAt || typeof decoded?.iat !== 'number') return false;
    return decoded.iat * 1000 < new Date(sessionStartedAt).getTime();
}

module.exports = { sessionStartNow, isSessionReplaced };
