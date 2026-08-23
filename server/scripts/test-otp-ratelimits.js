// Exercises the OTP limiter configuration from routes/index.js against a real
// express app, to confirm the new caps actually reject.
const express   = require('express');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const OTP_MAX_PER_PHONE_PER_HOUR = 5;
const OTP_MAX_PER_IP_PER_HOUR    = 20;

const otpPhoneLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: OTP_MAX_PER_PHONE_PER_HOUR,
    keyGenerator: (req) => {
        const phone = req.body?.phoneNumber || '';
        if (!phone) return ipKeyGenerator(req.ip);
        return `otp_phone:${crypto.createHash('sha256').update(phone).digest('hex')}`;
    },
    message: { status: 'error', code: 429 },
    standardHeaders: true, legacyHeaders: false,
});
const otpIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: OTP_MAX_PER_IP_PER_HOUR,
    keyGenerator: (req) => `otp_ip:${ipKeyGenerator(req.ip)}`,
    message: { status: 'error', code: 429 },
    standardHeaders: true, legacyHeaders: false,
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.post('/api/auth/phone/secured', otpIpLimiter, otpPhoneLimiter, (req, res) => res.status(202).json({ ok: true }));

const server = app.listen(0, async () => {
  const port = server.address().port;
  const post = (phone, ip) => fetch(`http://127.0.0.1:${port}/api/auth/phone/secured`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ phoneNumber: phone }),
  }).then(r => r.status);

  let fail = 0;
  const check = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
  };

  // 1. Same phone, same IP — 6th request must be blocked (phone cap = 5).
  let statuses = [];
  for (let i = 0; i < 6; i++) statuses.push(await post('+14165550000', '1.1.1.1'));
  check('same phone: first 5 accepted', statuses.slice(0,5).every(s => s === 202), true);
  check('same phone: 6th rejected',     statuses[5], 429);

  // 2. Rotating phones from one IP — the attack the phone-keyed bucket cannot see.
  //    IP cap = 20, and 6 are already spent from step 1.
  statuses = [];
  for (let i = 0; i < 20; i++) statuses.push(await post(`+1416555${String(1000+i)}`, '1.1.1.1'));
  check('rotating phones from one IP eventually blocked', statuses.includes(429), true);
  const accepted = statuses.filter(s => s === 202).length;
  check('rotating phones: accepted count within IP budget', accepted <= 14, true);

  // 3. A different IP is unaffected by another IP's exhaustion.
  check('fresh IP still served', await post('+14165559999', '2.2.2.2'), 202);

  server.close();
  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
});
