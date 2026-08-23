#!/usr/bin/env node
// Generates a new OTP signing secret and client key code.
//
// Rotation is a five-step process — see the "OTP credential rotation" comment in
// api/controllers/auth.controller.js. The important part is that the backend
// accepts the old value alongside the new one until old mobile builds have drained,
// and that you come back and remove the retiring value afterwards.
const crypto = require('crypto');

const signature = crypto.randomBytes(32).toString('hex');
const keyCode   = crypto.randomBytes(16).toString('hex');

console.log(`
New OTP credentials
===================

Backend env (deploy this FIRST, keeping the current values as retiring):

  OTP_SIGNATURE_SECRET=${signature}
  OTP_SIGNATURE_SECRET_RETIRING=<paste the value you are replacing>
  OTP_CLIENT_KEY_CODE=${keyCode}
  OTP_CLIENT_KEY_CODE_RETIRING=<paste the value you are replacing>

iOS Config/Secrets.xcconfig (ship this SECOND, after the backend is live):

  OTP_SIGNATURE_SECRET = ${signature}
  OTP_CLIENT_KEY_CODE = ${keyCode}

Then watch the logs for "matched a RETIRING" warnings. When they stop, redeploy
with both *_RETIRING variables removed — the rotation is not complete until you do,
because until then the old secret is still accepted.
`);
