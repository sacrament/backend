/**
 * VoIP Push Notification Service
 *
 * Sends APNs VoIP pushes for incoming and ended calls (iOS only).
 */

const path = require('path');
const apn = require('apn');
const config = require('../utils/config');

const certsFolder = path.resolve(__dirname, '..', 'certs');

const apnProvider = new apn.Provider({
    token: {
        key: path.join(certsFolder, 'AuthKey_2XCWJRBL6T.p8'),
        keyId: config.IOS_KEY_TOKEN,
        teamId: config.IOS_TEAM_ID,
    },
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
    const note = new apn.Notification();
    note.expiry = 0;
    note.badge = 0;
    note.sound = 'default';
    note.alert = data.title;
    note.category = data.category;
    note.topic = `${config.IOS_BUNDLE}.voip`;
    note.payload = data.custom;
    note.pushType = 'background';
    note.priority = 5;

    if (data.category === 'VOIPMissedCall' || data.category === 'VOIPCallEnded') {
        note.badge = 1;
        note.expiry = Math.floor(Date.now() / 1000) + 3600;
    }

    return apnProvider.send(note, user.device.voipToken);
};

module.exports = VoiPNotifications;
