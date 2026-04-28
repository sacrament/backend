/**
 * Push Notification Service
 *
 * Handles all push notifications to iOS (APNs) and Android (GCM).
 * Errors are swallowed per-notification — a failed push should not crash callers.
 */

const path = require('path');
const gcm = require('node-gcm');
const config = require('../utils/config');
const ChatService = require('../services/domain/chat/chat.service');
const UserService = require('../services/domain/user/user.service');
const logger = require('../utils/logger');
const NativeApnsClient = require('./apns.native');

const certsFolder = path.resolve(__dirname, '..', 'certs');

class PushNotificationService {
    constructor() {
        logger.info('Initializing PushNotificationService with APNs provider');
        this._apnClient = new NativeApnsClient({
            key: path.join(certsFolder, 'AuthKey_2XCWJRBL6T.p8'),
            keyId: config.IOS_KEY_TOKEN,
            teamId: config.IOS_TEAM_ID,
            production: config.ENV_NAME === 'production',
            logger,
        });
    }

    // ─── Chat ────────────────────────────────────────────────────────────────

    async newMessage(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message._doc || content.message;

            delete from.token;
            delete from.device;
            stripMessageFields(message);

            const body = message.kind === 'text' ? message.content : message.kind;
            const title = from.name;

            await this.#send({
                title,
                body,
                category: 'NewMessage',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, save: 1, newMessage: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:newMessage — ${ex.message}`);
        }
    }

    async newChatMemberAdded(content) {
        try {
            const { offlineReceivers, genericMessage: message, chat, from, newMembers } = content;
            stripMessageFields(message);

            await this.#send({
                title: chat.name,
                body: 'New members were added',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, save: 1, newMembers, newMember: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:newChatMemberAdded — ${ex.message}`);
        }
    }

    async newChatCreated(content) {
        try {
            const { offlineReceivers, chat, from } = content;

            await this.#send({
                title: from?.name || chat?.name || 'New chat',
                body: 'New chat created',
                category: 'NewChatCreated',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), fromUser: from, save: 1, newChatCreated: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:newChatCreated — ${ex.message}`);
        }
    }

    async membersRemovedFromChat(content) {
        try {
            const { offlineReceivers, genericMessage: message, chat, from, removedMembers } = content;
            stripMessageFields(message);

            await this.#send({
                title: chat.name,
                body: 'Members were removed from chat',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, save: 1, removedMembers, memberRemoved: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:membersRemovedFromChat — ${ex.message}`);
        }
    }

    async chatDeleted(content) {
        try {
            const { offlineReceivers, chat, from } = content;

            await this.#send({
                title: from.name,
                body: 'Deleted',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), fromUser: from, deleted: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:chatDeleted — ${ex.message}`);
        }
    }

    async memberLeftChat(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message;

            delete from.token;
            stripMessageFields(message);

            const userLeft = await getUserDetails(from.id);

            await this.#send({
                title: from.name,
                body: `${userLeft.name} left the chat`,
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, save: 1, memberLeftChat: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:memberLeftChat — ${ex.message}`);
        }
    }

    async blockChat(content) {
        try {
            const { offlineReceivers, blockStatus, chat, from } = content;
            delete from.token;

            await this.#sendSilent({
                custom: { chat: chatRef(chat), fromUser: from, save: 1, blockChat: true, blockStatus },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:blockChat — ${ex.message}`);
        }
    }

    async messageDeleted(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message;
            stripMessageFields(message);

            const senderName = from.name || (await getUserDetails(from.id)).name;
            const title = senderName;

            await this.#send({
                title,
                body: 'Deleted a message',
                silent: true,
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, deleted: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:messageDeleted — ${ex.message}`);
        }
    }

    async reactOnMessage(content) {
        try {
            const { offlineReceivers, chat, from, reaction } = content;
            const message = content.message;
            stripMessageFields(message);

            const senderName = typeof from === 'string'
                ? (await getUserDetails(from)).name
                : from.name;

            const title = senderName;

            await this.#send({
                title,
                body: 'Reacted on a message',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), messageId: message._id, reaction, fromUser: from, save: 1, isReact: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:reactOnMessage — ${ex.message}`);
        }
    }

    async editMessage(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message._doc || content.message;
            stripMessageFields(message);

            const senderName = from.name || (await getUserDetails(from._id?.toString() ?? from.id)).name;

            await this.#send({
                title: senderName,
                body: message.content || 'Edited a message',
                category: 'EditMessage',
                pref: 'newMessages',
                custom: { chat: chatRef(chat), message, fromUser: from, save: 1, messageEdited: true },
            }, offlineReceivers);
        } catch (ex) {
            logger.error(`push:editMessage — ${ex.message}`);
        }
    } 

    // ─── Mark / Seen ─────────────────────────────────────────────────────────

    async markMessageReceived(content) {
        try {
            await this.#sendSilent({
                custom: { messageId: content.messageId, fromUser: content.by, date: content.date, messageDelivered: true },
            }, content.offlineReceivers);
        } catch (ex) {
            logger.error(`push:markMessageReceived — ${ex.message}`);
        }
    }

    async markMessageSeen(content) {
        try {
            await this.#sendSilent({
                custom: { messageId: content.messageId, fromUser: content.by, date: content.date, messageSeen: true },
            }, content.offlineReceivers);
        } catch (ex) {
            logger.error(`push:markMessageSeen — ${ex.message}`);
        }
    }

    async markConversationSeen(content) {
        try {
            await this.#sendSilent({
                custom: { chatId: content.chat, fromUser: content.by, date: content.date, markConversationSeen: true },
            }, content.offlineReceivers);
        } catch (ex) {
            logger.error(`push:markConversationSeen — ${ex.message}`);
        }
    }

    // ─── Calls ───────────────────────────────────────────────────────────────

    async incomingCall(content) {
        try {
            const from = { ...content.from._doc };
            const to = content.to._doc;
            delete from.device;

            await this.#send({
                title: 'Incoming call',
                body: from.name,
                custom: { token: content.token, call: content.call, fromUser: from, mode: content.mode },
            }, [to]);
        } catch (ex) {
            logger.error(`push:incomingCall — ${ex.message}`);
        }
    }

    async callRequest(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            const modeLabel = content.mode === 'video' ? 'video' : 'audio';

            await this.#send({
                title: from.name,
                body: `Wants to ${modeLabel} call you`,
                category: 'CallRequest',
                pref: 'chatRequests',
                custom: {
                    requestId: content.requestId,
                    chatId: content.chatId,
                    fromUser: from,
                    mode: content.mode,
                    isCallRequest: true,
                },
            }, [content.to]);
        } catch (ex) {
            logger.error(`push:callRequest — ${ex.message}`);
        }
    }

    async callRequestResponse(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            const isAccepted = content.status === 'accepted';
            const modeLabel = content.mode === 'video' ? 'video' : 'audio';

            await this.#send({
                title: isAccepted ? 'Call request accepted' : 'Call request declined',
                body: isAccepted
                    ? `${from.name} accepted your ${modeLabel} call request`
                    : `${from.name} declined your ${modeLabel} call request`,
                category: isAccepted ? 'CallRequestAccepted' : 'CallRequestDeclined',
                pref: 'chatRequests',
                custom: {
                    requestId: content.requestId,
                    chatId: content.chatId,
                    fromUser: from,
                    mode: content.mode,
                    status: content.status,
                    isCallRequestResponse: true,
                },
            }, [content.to]);
        } catch (ex) {
            logger.error(`push:callRequestResponse — ${ex.message}`);
        }
    }

    async missedCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            await this.#send({
                title: 'Missed call',
                body: from.name,
                category: 'VOIPMissedCall',
                custom: { call: content.call, fromUser: from, mode: content.mode, missedCall: true },
            }, [content.to]);
        } catch (ex) {
            logger.error(`push:missedCall — ${ex.message}`);
        }
    }

    async endCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            await this.#send({
                title: 'Call ended',
                body: from.name,
                category: 'VOIPCallEnded',
                custom: { call: content.call, fromUser: from, mode: content.mode, end: true },
            }, [content.to]);
        } catch (ex) {
            logger.error(`push:endCall — ${ex.message}`);
        }
    }

    // ─── Nearby Radar ────────────────────────────────────────────────────────

    /**
     * Push to a nearby user whose radar just caught a stranger entering their area.
     * @param {{ recipient: Object }} content
     */
    async newUsersNearby(content) {
        try {
            const { recipient } = content;
            await this.#send({
                title: 'New users nearby',
                body: 'Someone is close to you right now',
                category: 'NewUsersNearby',
                pref: 'nearbyWinks',
                custom: { newUsersNearby: true },
            }, [recipient]);
        } catch (ex) {
            logger.error(`push:newUsersNearby — ${ex.message}`);
        }
    }

    /**
     * Push to a nearby user when one of their connections enters their area.
     * @param {{ movingUser: Object, recipient: Object }} content
     */
    async connectionNearby(content) {
        try {
            const { movingUser, recipient } = content;
            await this.#send({
                title: `Nearby connection`,
                body: `${movingUser.name} is nearby you right now`,
                category: 'ConnectionNearby',
                pref: 'nearbyWinks',
                custom: { connectionNearby: true, userId: movingUser._id?.toString() ?? movingUser.id },
            }, [recipient]);
        } catch (ex) {
            logger.error(`push:connectionNearby — ${ex.message}`);
        }
    }

    // ─── Connection Requests ─────────────────────────────────────────────────

    async newConnectionRequest(request) {
        try {
            await this.#send({
                title: request.from.name,
                body: 'Sent you a connection request',
                category: 'NewConnectionRequest',
                pref: 'connectionRequests',
                custom: { request, fromUser: request.from, save: 1, isConnectionRequest: true },
            }, [request.to]);
        } catch (ex) {
            logger.error(`push:newConnectionRequest — ${ex.message}`);
        }
    }

    async respondConnectionRequest(from, to, request, response) {
        try {
            // Ensure 'to' is in the expected format for _send
            const recipients = Array.isArray(to) ? to : [to];
            
            await this.#send({
                title: from.name,
                body: response === 'accepted' ? 'Accepted your request' : 'Declined your request',
                category: 'RespondConnectionRequest',
                pref: 'connectionRequests',
                custom: { request, fromUser: from, save: 1, respondConnetionRequest: true, response },
            }, recipients);
        } catch (ex) {
            logger.error(`push:respondConnectionRequest — ${ex.message}`);
        }
    }

    async cancellConnectionRequest(request) {
        try {
            await this.#sendSilent({
                custom: { request, fromUser: request.from, save: 1, cancelConnetionRequest: true },
                category: 'CancelConnectionRequest',
            }, [request.to]);
        } catch (ex) {
            logger.error(`push:cancellConnectionRequest — ${ex.message}`);
        }
    }

    /**
     * Send a silent (background) push to one or more user IDs.
     * @param {object} data  - { custom, category }
     * @param {string[]} userIds
     */
    async sendSilentToUser(data, userIds) {
        try {
            await this.#sendSilent(data, userIds);
        } catch (ex) {
            logger.error(`push:sendSilentToUser — ${ex.message}`);
        }
    }

    async undoConnectionFriendship(from, request, to) {
        try {
            await this.#sendSilent({
                custom: { request, fromUser: from, save: 1, undoConnectionFriendship: true },
                category: 'UndoConnectionFriendship',
            }, [to]);
        } catch (ex) {
            logger.error(`push:undoConnectionFriendship — ${ex.message}`);
        }
    }

    async reminderForConnectionRequest(from, request, to) {
        try {
            await this.#send({
                title: 'Connection request reminder',
                body: `${from.name} sent you a connection request`,
                category: 'ReminderConnectionRequest',
                pref: 'connectionRequests',
                custom: { request, fromUser: from, save: 1, isConnectionRequestReminder: true },
            }, [to]);
        } catch (ex) {
            logger.error(`push:reminderForConnectionRequest — ${ex.message}`);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    async #send(data, users) {
        if (!users || users.length === 0) {
            console.warn(`push:_send — No users provided`);
            return [];
        }

        const promises = users.map(async (member) => {
            try {
                // Create per-user payload copies to prevent shared-state mutation across
                // concurrent promises (badge, sound, muted-state deletions must be isolated).
                const { iOSContent, androidContent } = preparePayload(data);
                // Handle both embedded user objects and references
                let user = member.user || member;
                
                // If user is just an ID, fetch full details
                if (typeof user === 'string') {
                    user = await getUserDetails(user);
                    if (!user) {
                        console.warn(`push:_send — Could not fetch user details for ${member}`);
                        return { skipped: true };
                    }
                }

                // Check notification preference if one was specified for this push type
                const prefs = user.notificationPreferences ?? (await getUserPreferences(user._id.toString()));
                if (data.pref && prefs?.[data.pref] === false) {
                    console.log(`push:_send — User ${user._id?.toString()} has ${data.pref} disabled, skipping`);
                    return { skipped: true, reason: 'preference_disabled' };
                }

                // Validate device exists
                if (!user?.device) {
                    console.warn(`push:_send — User ${user._id?.toString()} has no device`);
                    return { skipped: true };
                }

                // validate user device is not mongo Objectid (happens when user is passed as an ID but fetching details fails)
                if (user.device.constructor.name === 'ObjectId') {
                    console.warn(`push:_send — User ${user._id?.toString()} has invalid device data`);
                    // fetch the device details to confirm if it's a valid device or just an ObjectId placeholder
                    const userDetails = await getUserDetails(user._id.toString());
                    if (!userDetails?.device || (typeof userDetails.device === 'object' && userDetails.device.constructor.name === 'ObjectId')) {
                        console.warn(`push:_send — User ${user._id?.toString()} has no valid device after fetching details`);
                        return { skipped: true };
                    }
                    user.device = userDetails.device; // update with valid device details
                }

                // Validate token exists
                if (!user.device.token) {
                    console.warn(`push:_send — User ${user._id?.toString()} device has no token`);
                    return { skipped: true };
                }

                const muted = member.options?.muted || false;

                const totalUnread = await getUnreadMessagesForUser(user._id.toString());
                const badge = totalUnread + (data.custom.isReact || data.custom.isConnectionRequest || data.custom.respondConnetionRequest ? 1 : 0);

                iOSContent.badge = badge;
                iOSContent.aps.badge = badge;
                androidContent.addData('badge', badge);

                if (muted) {
                    iOSContent.priority = 5;
                    iOSContent.pushType = 'background';
                    iOSContent.payload.silent = true;
                    iOSContent.payload.alert = data.alert;
                    iOSContent.aps['content-available'] = 1;
                    iOSContent.aps['mutable-content'] = 0;
                    delete iOSContent.aps.alert;
                    delete iOSContent.aps.badge;
                    delete iOSContent.badge;
                    delete iOSContent.aps.sound;
                }

                // Apply user notification preferences: sound, badge, vibration
                if (prefs?.sound === false) {
                    delete iOSContent.aps.sound;
                    androidContent.addData('sound', null);
                }
                if (prefs?.badge === false) {
                    delete iOSContent.aps.badge;
                    delete iOSContent.badge;
                    androidContent.addData('badge', 0);
                }
                if (prefs?.vibration === false) {
                    // Android: vibrate key; iOS has no direct vibration toggle in APNs
                    androidContent.addData('vibrate', false);
                }

                // Normalize device type — handles both embedded ('IOS'/'ANDROID') and Device-collection ('iOS'/'Android')
                const deviceType = (user.device?.type || user.device?.platform || '').toUpperCase();
                const isAndroid  = deviceType === 'ANDROID';
                const payload    = isAndroid ? androidContent : iOSContent;

                if (data.custom.message?.kind === 'image' || data.custom.message?.kind === 'video') {
                    if (!isAndroid) {
                        payload.payload.message.media[0].thumbnail = '';
                    } else {
                        payload.params.data.message.media[0].thumbnail = '';
                    }
                }

                const payloadSize = JSON.stringify(payload).length;
                if (payloadSize > 3900 && payload.payload?.message) {
                    payload.payload.save = 0;
                    const msg = payload.payload.message;
                    payload.payload.message = {
                        _id: msg._id,
                        content: msg.content,
                        mediaUrl: msg.media?.length ? msg.media[0].url : '',
                        kind: msg.kind,
                        chatId: msg.chatId,
                        sentOnTimestamp: msg.sentOnTimestamp,
                    };

                    // If still too large after trimming, tell the client to fetch via GET /message/:id
                    const trimmedSize = JSON.stringify(payload).length;
                    if (trimmedSize > 3900) {
                        payload.payload.save = 1;
                        payload.payload.message = {
                            messageId: msg._id,
                            chatId: msg.chatId,
                            fromId: msg.from?._id ?? msg.from,
                        };
                    }
                }

                console.log(`push:_send — Sending to ${user._id} (${isAndroid ? 'Android' : 'iOS'}) token: ${user.device.token.substring(0,16)}...`);

                return isAndroid
                    ? this.#sendAndroid(user.device.token, payload)
                    : this.#sendIOS(user.device.token, payload);
            } catch (err) {
                console.error(`push:_send — Error processing user: ${err.message}`);
                return { error: err.message };
            }
        });

        return Promise.all(promises);
    }

    async #sendSilent(data, users) {
        if (!users || users.length === 0) {
            console.warn(`push:_sendSilent — No users provided`);
            return [];
        }

        const { iOSContent, androidContent } = preparePayload(data);

        const promises = users.map(async (id) => {
            try {
                const userId = typeof id === 'string' ? id : (id.user?.toString() ?? id._id.toString());
                const user = await getUserDetails(userId);

                if (!user?.device?.token) {
                    console.warn(`push:_sendSilent — User ${userId} has no device token`);
                    return { skipped: true };
                }

                const deviceType = (user.device?.type || user.device?.platform || '').toUpperCase();
                console.log(`push:_sendSilent — Sending to ${userId} (${deviceType})`);
                
                return deviceType === 'ANDROID'
                    ? this.#sendAndroid(user.device.token, androidContent)
                    : this.#sendIOS(user.device.token, iOSContent);
            } catch (err) {
                console.error(`push:_sendSilent — Error: ${err.message}`);
                return { error: err.message };
            }
        });

        return Promise.all(promises);
    }

    #sendIOS(tokens, content) {
        // Skip if no valid tokens
        if (!tokens || (Array.isArray(tokens) && tokens.length === 0)) {
            console.warn(`push:sendIOS — No valid iOS tokens provided`);
            return Promise.resolve({ skipped: true });
        }

        return new Promise((resolve) => {
            try {
                // Ensure tokens is always an array.
                const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
                
                console.log(`push:sendIOS — Attempting to send via APNs to ${tokenArray.length} token(s)`);

                Promise.all(tokenArray.map((token) => this._apnClient.send({
                    deviceToken: token,
                    topic: content.topic,
                    pushType: content.pushType,
                    priority: content.priority,
                    expiration: content.expiration,
                    payload: content.payload,
                })))
                    .then((results) => {
                        const sent = results.filter(r => r.ok);
                        const failed = results.filter(r => !r.ok);

                        console.log(`push:sendIOS — APNs response:`, { sent: sent.length, failed: failed.length });

                        if (sent.length > 0) {
                            return resolve({ sent: sent[0] });
                        }

                        if (failed.length > 0) {
                            console.error(`push:sendIOS — APNs failed:`, failed[0]);
                            return resolve({ failed: failed[0] });
                        }

                        resolve({});
                    })
                    .catch(err => {
                        console.error(`push:sendIOS — APNs error: ${JSON.stringify(err)}`);
                        resolve({ error: err });
                    });
            } catch (err) {
                console.error(`push:sendIOS — Exception: ${err.message}`);
                resolve({ error: err.message });
            }
        });
    }

    #sendAndroid(tokens, content) {
        const sender = new gcm.Sender(config.GCM_SERVER_ID);
        return new Promise((resolve) => {
            try {
                console.log(`push:sendAndroid — Attempting to send via GCM`);
                sender.send(content, [tokens], (err, response) => {
                    if (err) {
                        console.error(`push:sendAndroid — GCM error: ${err.message}`, err);
                        return resolve({ failed: err.message });
                    }
                    console.log(`push:sendAndroid — GCM response:`, { success: response.success, failure: response.failure });
                    const result = response.results[0];
                    resolve(response.failure > 0 ? { failed: result } : { sent: result });
                });
            } catch (err) {
                console.error(`push:sendAndroid — Exception: ${err.message}`);
                resolve({ error: err.message });
            }
        });
    }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

const getUnreadMessagesForUser = (userId) => {
    const chatService = new ChatService();
    return chatService.countUnreadMessagesForUser(userId);
};

const getUserDetails = (userId) => {
    const userService = new UserService();
    return userService.getUserById(userId, true);
};

const getUserPreferences = async (userId) => {
    const User = require('mongoose').model('User');
    const doc = await User.findById(userId, 'notificationPreferences').lean();
    return doc?.notificationPreferences ?? null;
};

const chatRef = (chat) => ({
    id: chat._id.toString(),
    name: chat.name,
    type: chat.type,
    unreadMessages: 0,
});

const stripMessageFields = (message) => {
    delete message.status;
    delete message.deleted;
    delete message.uniqueId;
    delete message.editedOn;
    delete message.summary;
};

const preparePayload = (content) => {
    const chatId = content.custom?.chat?.id ?? '';

    const iOSContent = {
        expiration: Math.floor(Date.now() / 1000) + 3600,
        badge: content.badge,
        payload: {
            aps: {
                alert: { title: content.title, body: content.body },
                sound: 'ping.aiff',
                'mutable-content': 1,
                'content-available': 1,
            },
            ...content.custom,
        },
        topic: config.IOS_BUNDLE,
        pushType: 'alert',
        priority: 10,
        category: content.category || '',
    };

    iOSContent.aps = iOSContent.payload.aps;

    if (iOSContent.badge !== undefined && iOSContent.badge !== null) {
        iOSContent.aps.badge = iOSContent.badge;
    }

    if (iOSContent.category) {
        iOSContent.aps.category = iOSContent.category;
    }

    if (content.silent) {
        iOSContent.aps['content-available'] = 1;
        iOSContent.aps['mutable-content'] = 1;
        iOSContent.pushType = 'background';
        iOSContent.payload.silent = true;
        iOSContent.payload.alert = { title: content.title, body: content.body };
        iOSContent.priority = 5;
        delete iOSContent.aps.alert;
        delete iOSContent.aps.badge;
        delete iOSContent.aps.sound;
    }

    const message = new gcm.Message({
        collapseKey: chatId,
        priority: 'high',
        contentAvailable: false,
        timeToLive: 28 * 86400,
        data: content.custom,
    });

    return { iOSContent, androidContent: message };
};
  

module.exports = new PushNotificationService();
