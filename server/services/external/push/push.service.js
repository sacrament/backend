const Twilio = require('twilio');
const config = require('../../../utils/config');
const UserService = require('../../domain/user/user.service');
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const moment = require('moment-timezone');

class PushNotificationService {

    constructor() {
        // console.log(`Dev: ${process.env.ENV_NAME}`);
    }
    
    async bindDevice(bindingRequest) {
        console.log('Bind user device');
        return new Promise(async (resolve, reject) => {
            try {
                if (/^(apn|fcm)$/.test(bindingRequest.type)) {
                    const service = getTwilioClient();
                    let binding = await service.bindings.create({
                        bindingType: bindingRequest.type,
                        address: bindingRequest.token,
                        identity: bindingRequest.identity
                    });
                    resolve(binding);
                } else {
                    console.error('Invalid type value');
                    reject(new Error('Invalid type value'));
                }
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }

    async unbindDevice(sid, userId = null)
    {
        console.log('Unbind user device');
        return new Promise(async (resolve, reject) => {
            try {
                const service = getTwilioClient();
                service.bindings(sid).remove();
                console.log('Device was unbind');
                resolve();
                //MARK: Remove token
                const userService = new UserService();
                // if (typeof userId === 'number') {  
                //     userId = await userService.getUserIds([userId]);
                // }
                userService.disableUserDeviceFor(userId)
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }

    async send(userId, notificationData)
    {
        console.log('Send user notification');
        return new Promise(async (resolve, reject) => {
            try {
                const userService = new UserService();
                let user = await userService.getUserByIntId(userId);
                notificationData.data.userName = user.name;
                notificationData.data.userImage = user.imageUrl;
                notificationData.data.pushDate = moment().tz('UTC').format('YYYY-MM-DD HH:mm:ss');

                const service = getTwilioClient();
                let notification = await service.notifications.create(notificationData);
                console.log('Notification:' + JSON.stringify(notification));
                resolve(notification);
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }
}

function getTwilioClient() {
    const client = new Twilio(config.TWILIO_DEV.ACCOUNTSID, config.TWILIO_DEV.AUTHTOKEN);
    return client.notify.services(config.TWILIO_DEV.NOTIFICATION_SERVICE_SID);
}

module.exports = PushNotificationService;
