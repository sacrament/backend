const PushNotifications = require("../notifications/index");

class UserPushNotifications extends PushNotifications {
    newConnectionRequest(from, request, to) {
        return newConnectionRequest(from, request, to);
    }
}

const newConnectionRequest = async (from, request, to) => {
    try {
        console.log(`Sending push for new connection request`);

        let data = {};

        const data = {
            custom = {
                request: request,
                fromUser: from,
                save: 1,
                to: to,
                isConnectionRequest: true
            }
        };

        data.category = 'NewConnectionMessage';

        const result = await this.processNotification(data, [to.toString()]);
        console.log(`Chat new message push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for new message: ${ex.message}`)
    }
}

module.exports = UserPushNotifications;