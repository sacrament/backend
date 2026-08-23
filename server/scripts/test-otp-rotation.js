// Proves the OTP credential rotation window behaves correctly:
// during overlap both the new and the retiring secret are accepted; once the
// retiring value is removed, only the new one works.
//
// Mirrors the verification logic in api/controllers/auth.controller.js.
const crypto = require('crypto');

function parseSecretList(value) {
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}
function otpSignatureSecrets() {
  return [
    ...parseSecretList(process.env.OTP_SIGNATURE_SECRET),
    ...parseSecretList(process.env.OTP_SIGNATURE_SECRET_RETIRING),
  ];
}
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch { return false; }
}
function sign(secret, phone, minuteOffset = 0) {
  const minute = Math.floor(Date.now() / 60000) + minuteOffset;
  return crypto.createHmac('sha256', secret).update(`${phone}:${minute}`).digest('hex');
}
/** Returns the matched slot index, or -1. */
function verify(signature, phone) {
  const secrets = otpSignatureSecrets();
  const minute = Math.floor(Date.now() / 60000);
  for (let i = 0; i < secrets.length; i++) {
    const a = crypto.createHmac('sha256', secrets[i]).update(`${phone}:${minute}`).digest('hex');
    const b = crypto.createHmac('sha256', secrets[i]).update(`${phone}:${minute - 1}`).digest('hex');
    if (timingSafeEqualHex(signature, a) || timingSafeEqualHex(signature, b)) return i;
  }
  return -1;
}

const OLD = crypto.randomBytes(32).toString('hex');
const NEW = crypto.randomBytes(32).toString('hex');
const PHONE = '+14165550000';

let fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
};

// --- Before rotation: only OLD configured ---
process.env.OTP_SIGNATURE_SECRET = OLD;
delete process.env.OTP_SIGNATURE_SECRET_RETIRING;
check('before: old client accepted',        verify(sign(OLD, PHONE), PHONE), 0);
check('before: new client rejected',        verify(sign(NEW, PHONE), PHONE), -1);

// --- Overlap window: NEW current, OLD retiring ---
process.env.OTP_SIGNATURE_SECRET = NEW;
process.env.OTP_SIGNATURE_SECRET_RETIRING = OLD;
check('overlap: new client accepted (slot 0)',  verify(sign(NEW, PHONE), PHONE), 0);
check('overlap: old client still works (slot 1)', verify(sign(OLD, PHONE), PHONE), 1);
check('overlap: clock skew tolerated',          verify(sign(NEW, PHONE, -1), PHONE), 0);
check('overlap: unrelated secret rejected',     verify(sign(crypto.randomBytes(32).toString('hex'), PHONE), PHONE), -1);

// --- After retirement: only NEW ---
delete process.env.OTP_SIGNATURE_SECRET_RETIRING;
check('after: new client accepted',   verify(sign(NEW, PHONE), PHONE), 0);
check('after: old client rejected',   verify(sign(OLD, PHONE), PHONE), -1);

// --- Fail closed when nothing is configured ---
delete process.env.OTP_SIGNATURE_SECRET;
check('unconfigured: no secrets available', otpSignatureSecrets().length, 0);
check('unconfigured: everything rejected',  verify(sign(NEW, PHONE), PHONE), -1);

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
