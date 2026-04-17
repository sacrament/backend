const http2 = require('http2');
const crypto = require('crypto');
const fs = require('fs');

class NativeApnsClient {
    constructor(options = {}) {
        this._key = this._resolvePrivateKey(options.key);
        this._keyId = options.keyId;
        this._teamId = options.teamId;
        this._production = !!options.production;
        this._timeoutMs = options.timeoutMs || 10000;
        this._logger = options.logger || console;

        this._origin = this._production
            ? 'https://api.push.apple.com'
            : 'https://api.sandbox.push.apple.com';

        this._session = null;
        this._queue = Promise.resolve();
        this._tokenCache = { jwt: null, expMs: 0 };
    }

    send(message) {
        return this._enqueue(() => this._sendNow(message));
    }

    close() {
        if (this._session) {
            this._session.close();
            this._session = null;
        }
    }

    _enqueue(task) {
        const run = this._queue.then(task);
        this._queue = run.catch(() => {});
        return run;
    }

    async _sendNow(message) {
        if (!message?.deviceToken) {
            return { ok: false, status: 0, reason: 'MissingDeviceToken' };
        }

        if (!message?.topic) {
            return { ok: false, status: 0, reason: 'MissingTopic' };
        }

        const session = this._ensureSession();
        const jwt = this._getProviderToken();

        const headers = {
            ':method': 'POST',
            ':path': `/3/device/${message.deviceToken}`,
            authorization: `bearer ${jwt}`,
            'apns-topic': message.topic,
            'apns-push-type': message.pushType || 'alert',
            'apns-priority': String(message.priority ?? 10),
            'apns-expiration': String(message.expiration ?? 0),
            'content-type': 'application/json',
        };

        if (message.collapseId) {
            headers['apns-collapse-id'] = message.collapseId;
        }

        const body = JSON.stringify(message.payload || {});

        return new Promise((resolve) => {
            let status = 0;
            let apnsId = null;
            let responseBody = '';

            const req = session.request(headers);

            req.setEncoding('utf8');
            req.setTimeout(this._timeoutMs, () => {
                req.close(http2.constants.NGHTTP2_CANCEL);
                resolve({ ok: false, status: 0, reason: 'Timeout' });
            });

            req.on('response', (responseHeaders) => {
                status = Number(responseHeaders[':status'] || 0);
                apnsId = responseHeaders['apns-id'] || null;
            });

            req.on('data', (chunk) => {
                responseBody += chunk;
            });

            req.on('end', () => {
                let parsed = null;
                if (responseBody) {
                    try {
                        parsed = JSON.parse(responseBody);
                    } catch (_) {
                        parsed = null;
                    }
                }

                if (status >= 200 && status < 300) {
                    resolve({ ok: true, status, apnsId });
                    return;
                }

                resolve({
                    ok: false,
                    status,
                    apnsId,
                    reason: parsed?.reason || 'APNsError',
                    timestamp: parsed?.timestamp,
                });
            });

            req.on('error', (err) => {
                this._logger.error(`APNs request error: ${err.message}`);
                resolve({ ok: false, status: 0, reason: err.message || 'RequestError' });
            });

            req.end(body);
        });
    }

    _ensureSession() {
        if (this._session && !this._session.closed && !this._session.destroyed) {
            return this._session;
        }

        const session = http2.connect(this._origin);

        session.on('error', (err) => {
            this._logger.error(`APNs session error: ${err.message}`);
        });

        const resetSession = () => {
            if (this._session === session) {
                this._session = null;
            }
        };

        session.on('close', resetSession);
        session.on('goaway', resetSession);

        this._session = session;
        return session;
    }

    _getProviderToken() {
        const nowMs = Date.now();
        if (this._tokenCache.jwt && nowMs < this._tokenCache.expMs) {
            return this._tokenCache.jwt;
        }

        const issuedAt = Math.floor(nowMs / 1000);
        const header = this._base64url(JSON.stringify({ alg: 'ES256', kid: this._keyId }));
        const claims = this._base64url(JSON.stringify({ iss: this._teamId, iat: issuedAt }));
        const signingInput = `${header}.${claims}`;

        const signer = crypto.createSign('sha256');
        signer.update(signingInput);
        signer.end();

        const signature = signer.sign(this._key);
        const jwt = `${signingInput}.${this._base64url(signature)}`;

        this._tokenCache = {
            jwt,
            expMs: nowMs + (50 * 60 * 1000),
        };

        return jwt;
    }

    _resolvePrivateKey(rawKey) {
        if (!rawKey) {
            throw new Error('APNs private key is required');
        }

        try {
            let keyMaterial = rawKey;

            // If a filesystem path is provided, load PEM content from disk.
            if (typeof rawKey === 'string' && !rawKey.includes('-----BEGIN')) {
                keyMaterial = fs.readFileSync(rawKey, 'utf8');
            }

            // Parse once to normalize and fail fast on invalid key format.
            return crypto.createPrivateKey({ key: keyMaterial, format: 'pem' });
        } catch (err) {
            throw new Error(`Invalid APNs private key: ${err.message}`);
        }
    }

    _base64url(input) {
        const base64 = Buffer.isBuffer(input)
            ? input.toString('base64')
            : Buffer.from(input).toString('base64');

        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }
}

module.exports = NativeApnsClient;
