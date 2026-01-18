
const path = require('path');
let certsPathFolder = path.resolve(__dirname);
certsPathFolder = certsPathFolder.replace("notifications", "");
const config = require('../utils/config')
const apn = require('apn');
 
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const UserService = require('../services/domain/user/user.service');

class VoiPNotifications { 
    async incomingCall(content) {
        try {
            console.log(`Sending VOIP push for new call`)
            const to = content.to; 
            const callToken = content.token;
            const call = content.call;
            const from = content.from;
            const chat = content.chat;
 
            // Get the details for the sender
            // const sender = await getUserDetails(from); 
            delete from.device;

            // const receiver = await getUserDetails(to);

            const data = {
                body: from.name,
                title: "Incoming call",
                category: "VOIPIncomingCall",
                custom: { 
                    token: callToken,
                    call: call,
                    fromUser: from,
                    mode: content.mode
                }
            };
            
            const result = await processNotification(data, to);
            console.log(`VOiP Result: ${JSON.stringify(result, undefined, 4)}`);
        } catch (ex) {
            console.error(`Error: VOIP sending push for new message: ${ex.message}`)
        }
    }

    async endCall(content) {
        try {
            console.log(`Sending VOIP push for end call`)
            const to = content.to; 
            // const callToken = content.token;
            const call = content.call;
            const from = content.from;
            const chat = content.chat;
 
            // Get the details for the sender
            // const sender = await getUserDetails(from); 
            delete from.device;

            // const receiver = await getUserDetails(to);

            const data = {
                body: from.name,
                title: "Missed call",
                category: "VOIPMissedCall",
                custom: { 
                    // token: callToken,
                    call: call,
                    fromUser: from,
                    mode: content.mode,
                    end: true
                }
            };
            
            const result = await processNotification(data, to);
            console.log(`VOiP: End Call Result: ${JSON.stringify(result, undefined, 4)}`);
        } catch (ex) {
            console.error(`Error: VOIP sending push for end Call: ${ex.message}`)
        }
    }
}

const options = { 
    token: {
        key: path.resolve(certsPathFolder, 'certs/AuthKey_2XCWJRBL6T.p8'), // optionally: fs.readFileSync('./certs/key.p8')
        keyId: config.IOS_KEY_TOKEN,
        teamId: config.IOS_TEAM_ID,
    },
    production: config.ENV_NAME == "production"
    // production: true
};
 
const apnProvider = new apn.Provider(options)
 
const getUserDetails = (userId) => {
    const userService = new UserService(UserModel);
    return userService.getUserById(userId)
}

const processNotification = async (data, user) => {
    const content = prepareData(data);
     
        // Get total unread chats for user
    // const totalUnread = await getUnreadChatsForUser(user._id.toString());
    // content.badge = totalUnread
    // content.custom.totalChatsUnread = totalUnread

    console.log(`VOIP content: ${JSON.stringify(content, undefined, 4)}`);

    const payloadSize = JSON.stringify(content).length;

    console.log(`VOIPPayload Size: ${payloadSize} bytes`);

    return await apnProvider.send(content, user.device.voipToken); 

    // return resultFromPush;
}

const prepareData = (data) => {
    const note = new apn.Notification();

    note.expiry = 0 //Math.floor(Date.now() / 1000) + 3600//; // Expires 1 hour from now.
    note.badge = 0;
    if (data.category == "VOIPMissedCall" || data.category == "VOIPCallEnded") {
        note.badge = 1;
        note.expiry = Math.floor(Date.now() / 1000) + 3600;
    }
    note.sound = "default";
    note.alert = data.title; //"Incoming Call";
    note.category = data.category; //"VOIPIncomingCall" 
    note.topic = config.IOS_BUNDLE + ".voip";
    note.payload = data.custom;
    note.pushType = 'background';
    // note.contentAvailable = true; 
    note.priority = 5;

    return note;
}

module.exports = VoiPNotifications;