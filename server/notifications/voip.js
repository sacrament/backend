/**
 * VoIP Push Notification Service
 *
 * Sends APNs VoIP pushes for incoming and ended calls (iOS only).
 */

const path = require('path');
const config = require('../utils/config');
const NativeApnsClient = require('./apns.native');

const certsFolder = path.resolve(__dirname, '..', 'certs');

const apnClient = new NativeApnsClient({
    key: path.join(certsFolder, 'AuthKey_2XCWJRBL6T.p8'),
    keyId: config.IOS_KEY_TOKEN,
    teamId: config.IOS_TEAM_ID,
    production: config.ENV_NAME === 'production',
});

class VoiPNotifications {
    async incomingCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            const data = {
                title: 'Incoming call',
                body: from.name,
                category: 'VOIPIncomingCall',
                custom: {
                    token: content.token,
                    call: content.call,
                    fromUser: from,
                    mode: content.mode,
                },
            };

            const result = await _send(data, content.to);
            console.log(`VoIP:incomingCall — ${JSON.stringify(result)}`);
        } catch (ex) {
            console.error(`VoIP:incomingCall — ${ex.message}`);
        }
    }

    async endCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            const data = {
                title: 'Missed call',
                body: from.name,
                category: 'VOIPMissedCall',
                custom: {
                    call: content.call,
                    fromUser: from,
                    mode: content.mode,
                    end: true,
                },
            };

            const result = await _send(data, content.to);
            console.log(`VoIP:endCall — ${JSON.stringify(result)}`);
        } catch (ex) {
            console.error(`VoIP:endCall — ${ex.message}`);
        }
    }
}

const _send = (data, user) => {
    // Validate device and token
if (!user?.device?.voipToken) {
        console.warn(`VoIP:_send — No voip token for user: ${user?._id || 'unknown'}`);
        return Promise.resolve({ skipped: true });
    }

    const payload = {
        aps: {
            alert: data.title,
            sound: 'default',
            badge: 0,
            category: data.category,
            'content-available': 1,
        },
        ...data.custom,
    };

    let expiration = 0;

    if (data.category === 'VOIPMissedCall' || data.category === 'VOIPCallEnded') {
        payload.aps.badge = 1;
        expiration = Math.floor(Date.now() / 1000) + 3600;
    }

    return apnClient.send({
        deviceToken: user.device.voipToken,
        topic: `${config.IOS_BUNDLE}.voip`,
        pushType: 'voip',
        priority: 10,
        expiration,
        payload,
    });
};

module.exports = VoiPNotifications;
