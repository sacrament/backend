/**
 * Single source of truth for which User.status values prevent using the account.
 *
 * Login (UserService#assertAccountCanAuthenticate) and every authenticated request
 * (middleware/verify.js#verifyToken) must agree on this list, or an account can end up
 * able to log in — getting a valid token — and then 403 on the very next call. That is
 * exactly what happened with 'inactive': verifyToken rejected it on every request, but
 * login never checked for it, so a signup could complete, issue a token, and then 403
 * on the first authenticated call the app makes afterwards (uploading the E2EE key
 * backup, right after account creation).
 *
 * Returns 'blocked' | 'deleted' | 'inactive' | null.
 */
function blockingStatus(user) {
    if (!user) return null;
    if (user.status === 'blocked') return 'blocked';
    if (user.deleted || user.status === 'deleted') return 'deleted';
    if (user.status === 'inactive') return 'inactive';
    return null;
}

module.exports = { blockingStatus };
