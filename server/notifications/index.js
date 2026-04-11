/**
 * Push Notification Service
 *
 * Handles all push notifications to iOS (APNs) and Android (GCM).
 * Errors are swallowed per-notification — a failed push should not crash callers.
 */

const path = require('path');
const apn = require('apn');
const gcm = require('node-gcm');
const config = require('../utils/config');
const ChatService = require('../services/domain/chat/chat.service');
const UserService = require('../services/domain/user/user.service');

const certsFolder = path.resolve(__dirname, '..', 'certs');

class PushNotificationService {
    constructor() {
        this._apnProvider = new apn.Provider({
            token: {
                key: path.join(certsFolder, 'AuthKey_2XCWJRBL6T.p8'),
                keyId: config.IOS_KEY_TOKEN,
                teamId: config.IOS_TEAM_ID,
            },
            production: config.ENV_NAME === 'production',
        });
    }

    // ─── Chat ────────────────────────────────────────────────────────────────

    async newMessage(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message._doc;

            delete from.token;
            delete from.device;
            _stripMessageFields(message);

            const body = message.kind === 'text' ? message.content : message.kind;
            const title = from.name;

            await this._send({
                title,
                body,
                category: 'NewMessage',
                custom: { chat: _chatRef(chat), message, fromUser: from, save: 1, newMessage: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:newMessage — ${ex.message}`);
        }
    }

    async newChatMemberAdded(content) {
        try {
            const { offlineReceivers, genericMessage: message, chat, from, newMembers } = content;
            _stripMessageFields(message);

            await this._send({
                title: chat.name,
                body: 'New members were added',
                custom: { chat: _chatRef(chat), message, fromUser: from, save: 1, newMembers, newMember: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:newChatMemberAdded — ${ex.message}`);
        }
    }

    async membersRemovedFromChat(content) {
        try {
            const { offlineReceivers, genericMessage: message, chat, from, removedMembers } = content;
            _stripMessageFields(message);

            await this._send({
                title: chat.name,
                body: 'Members were removed from chat',
                custom: { chat: _chatRef(chat), message, fromUser: from, save: 1, removedMembers, memberRemoved: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:membersRemovedFromChat — ${ex.message}`);
        }
    }

    async chatDeleted(content) {
        try {
            const { offlineReceivers, chat, from } = content;

            await this._send({
                title: from.name,
                body: 'Deleted',
                custom: { chat: _chatRef(chat), fromUser: from, deleted: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:chatDeleted — ${ex.message}`);
        }
    }

    async memberLeftChat(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message;

            delete from.token;
            _stripMessageFields(message);

            const userLeft = await _getUserDetails(from.id);

            await this._send({
                title: from.name,
                body: `${userLeft.name} left the chat`,
                custom: { chat: _chatRef(chat), message, fromUser: from, save: 1, memberLeftChat: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:memberLeftChat — ${ex.message}`);
        }
    }

    async blockChat(content) {
        try {
            const { offlineReceivers, blockStatus, chat, from } = content;
            delete from.token;

            await this._sendSilent({
                custom: { chat: _chatRef(chat), fromUser: from, save: 1, blockChat: true, blockStatus },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:blockChat — ${ex.message}`);
        }
    }

    async messageDeleted(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message;
            _stripMessageFields(message);

            const senderName = from.name || (await _getUserDetails(from.id)).name;
            const title = senderName;

            await this._send({
                title,
                body: 'Deleted a message',
                silent: true,
                custom: { chat: _chatRef(chat), message, fromUser: from, deleted: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:messageDeleted — ${ex.message}`);
        }
    }

    async reactOnMessage(content) {
        try {
            const { offlineReceivers, chat, from, reaction } = content;
            const message = content.message;
            _stripMessageFields(message);

            const senderName = typeof from === 'string'
                ? (await _getUserDetails(from.id)).name
                : from.name;

            const title = senderName;

            await this._send({
                title,
                body: 'Reacted on a message',
                custom: { chat: _chatRef(chat), messageId: message._id, reaction, fromUser: from, save: 1, isReact: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:reactOnMessage — ${ex.message}`);
        }
    }

    async groupChatEdited(content) {
        try {
            const { offlineReceivers, chat, from } = content;
            const message = content.message;
            _stripMessageFields(message);

            await this._send({
                title: chat.name,
                body: 'Group chat edited',
                custom: { chat: { ..._chatRef(chat), imageUrl: chat.imageUrl }, message, fromUser: from, save: 1, chatEdited: true },
            }, offlineReceivers);
        } catch (ex) {
            console.error(`push:groupChatEdited — ${ex.message}`);
        }
    }

    // ─── Mark / Seen ─────────────────────────────────────────────────────────

    async markMessageReceived(content) {
        try {
            await this._sendSilent({
                custom: { messageId: content.messageId, fromUser: content.by, date: content.date, messageDelivered: true },
            }, content.offlineReceivers);
        } catch (ex) {
            console.error(`push:markMessageReceived — ${ex.message}`);
        }
    }

    async markMessageSeen(content) {
        try {
            await this._sendSilent({
                custom: { messageId: content.messageId, fromUser: content.by, date: content.date, messageSeen: true },
            }, content.offlineReceivers);
        } catch (ex) {
            console.error(`push:markMessageSeen — ${ex.message}`);
        }
    }

    async markConversationSeen(content) {
        try {
            await this._sendSilent({
                custom: { chatId: content.chat, fromUser: content.by, date: content.date, markConversationSeen: true },
            }, content.offlineReceivers);
        } catch (ex) {
            console.error(`push:markConversationSeen — ${ex.message}`);
        }
    }

    // ─── Calls ───────────────────────────────────────────────────────────────

    async incomingCall(content) {
        try {
            const from = { ...content.from._doc };
            const to = content.to._doc;
            delete from.device;

            await this._send({
                title: 'Incoming call',
                body: from.name,
                custom: { token: content.token, call: content.call, fromUser: from, mode: content.mode },
            }, [to]);
        } catch (ex) {
            console.error(`push:incomingCall — ${ex.message}`);
        }
    }

    async missedCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            await this._send({
                title: 'Missed call',
                body: from.name,
                category: 'VOIPMissedCall',
                custom: { call: content.call, fromUser: from, mode: content.mode, missedCall: true },
            }, [content.to]);
        } catch (ex) {
            console.error(`push:missedCall — ${ex.message}`);
        }
    }

    async endCall(content) {
        try {
            const from = { ...content.from };
            delete from.device;

            await this._send({
                title: 'Call ended',
                body: from.name,
                category: 'VOIPCallEnded',
                custom: { call: content.call, fromUser: from, mode: content.mode, end: true },
            }, [content.to]);
        } catch (ex) {
            console.error(`push:endCall — ${ex.message}`);
        }
    }

    // ─── Connection Requests ─────────────────────────────────────────────────

    async newConnectionRequest(request) {
        try {
            await this._send({
                title: request.from.name,
                body: 'Sent you a connection request',
                category: 'NewConnectionRequest',
                custom: { request, fromUser: request.from, save: 1, isConnectionRequest: true },
            }, [request.to]);
        } catch (ex) {
            console.error(`push:newConnectionRequest — ${ex.message}`);
        }
    }

    async respondConnectionRequest(from, to, request, response) {
        try {
            // Ensure 'to' is in the expected format for _send
            const recipients = Array.isArray(to) ? to : [to];
            
            await this._send({
                title: from.name,
                body: response === 'accepted' ? 'Accepted your request' : 'Declined your request',
                category: 'RespondConnectionRequest',
                custom: { request, fromUser: from, save: 1, respondConnetionRequest: true, response },
            }, recipients);
        } catch (ex) {
            console.error(`push:respondConnectionRequest — ${ex.message}`);
        }
    }

    async cancellConnectionRequest(request) {
        try {
            await this._sendSilent({
                custom: { request, fromUser: request.from, save: 1, cancelConnetionRequest: true },
                category: 'CancelConnectionRequest',
            }, [request.to]);
        } catch (ex) {
            console.error(`push:cancellConnectionRequest — ${ex.message}`);
        }
    }

    async undoConnectionFriendship(from, request, to) {
        try {
            await this._sendSilent({
                custom: { request, fromUser: from, save: 1, undoConnectionFriendship: true },
                category: 'UndoConnectionFriendship',
            }, [to]);
        } catch (ex) {
            console.error(`push:undoConnectionFriendship — ${ex.message}`);
        }
    }

    async reminderForConnectionRequest(from, request, to) {
        try {
            await this._send({
                title: 'Connection request reminder',
                body: `${from.name} sent you a connection request`,
                category: 'ReminderConnectionRequest',
                custom: { request, fromUser: from, save: 1, isConnectionRequestReminder: true },
            }, [to]);
        } catch (ex) {
            console.error(`push:reminderForConnectionRequest — ${ex.message}`);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    async _send(data, users) {
        const { iOSContent, androidContent } = _preparePayload(data);

        const promises = users.map(async (member) => {
            const user = member.user || member;
            const muted = member.options?.muted || false;

            const totalUnread = await _getUnreadMessagesForUser(user._id.toString());
            const badge = totalUnread + (data.custom.isReact || data.custom.isConnectionRequest || data.custom.respondConnetionRequest ? 1 : 0);

            iOSContent.badge = badge;
            iOSContent.aps.badge = badge;
            androidContent.addData('badge', badge);

            if (muted) {
                iOSContent.priority = 5;
                iOSContent.sound = '';
                iOSContent.contentAvailable = 1;
                iOSContent.mutableContent = 0;
                iOSContent.pushType = 'background';
                iOSContent.payload.silent = true;
                iOSContent.payload.alert = data.alert;
                delete iOSContent.aps.alert;
                delete iOSContent.aps.badge;
                delete iOSContent.badge;
                delete iOSContent.aps.title;
                delete iOSContent.aps.body;
                delete iOSContent.aps.sound;
            }

            const payload = user.device.type === 'IOS' ? iOSContent : androidContent;

            if (data.custom.message?.kind === 'image' || data.custom.message?.kind === 'video') {
                if (user.device.type === 'IOS') {
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
                };
            }

            return user.device.type === 'ANDROID'
                ? this._sendAndroid(user.device.token, payload)
                : this._sendIOS(user.device.token, payload);
        });

        return Promise.all(promises);
    }

    async _sendSilent(data, users) {
        const { iOSContent } = _preparePayload(data);

        const promises = users.map(async (id) => {
            const userId = typeof id === 'string' ? id : (id.user?.toString() ?? id._id.toString());
            const user = await _getUserDetails(userId);
            return this._sendIOS(user.device.token, iOSContent);
        });

        return Promise.all(promises);
    }

    _sendIOS(tokens, content) {
        return new Promise((resolve) => {
            this._apnProvider.send(content, tokens)
                .then(res => {
                    if (res.sent.length > 0) return resolve({ sent: res.sent[0] });
                    if (res.failed.length > 0) return resolve({ failed: res.failed[0] });
                    resolve({});
                })
                .catch(err => {
                    console.error(`push:sendIOS — ${JSON.stringify(err)}`);
                    resolve({ error: err });
                });
        });
    }

    _sendAndroid(tokens, content) {
        const sender = new gcm.Sender(config.GCM_SERVER_ID);
        return new Promise((resolve) => {
            sender.send(content, [tokens], (err, response) => {
                if (err) {
                    console.error(err);
                    return resolve({ failed: err.message });
                }
                const result = response.results[0];
                resolve(response.failure > 0 ? { failed: result } : { sent: result });
            });
        });
    }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

const _getUnreadMessagesForUser = (userId) => {
    const chatService = new ChatService();
    return chatService.countUnreadMessagesForUser(userId);
};

const _getUserDetails = (userId) => {
    const userService = new UserService();
    return userService.getUserById(userId, true);
};

const _chatRef = (chat) => ({
    id: chat._id.toString(),
    name: chat.name,
    type: chat.type,
    unreadMessages: 0,
});

const _stripMessageFields = (message) => {
    delete message.status;
    delete message.deleted;
    delete message.uniqueId;
    delete message.editedOn;
    delete message.summary;
};

const _preparePayload = (content) => {
    const chatId = content.custom?.chat?.id ?? '';

    const note = new apn.Notification({
        expiry: Math.floor(Date.now() / 1000) + 3600,
        badge: content.badge,
        sound: 'ping.aiff',
        alert: { title: content.title, body: content.body },
        payload: content.custom,
        topic: config.IOS_BUNDLE,
        mutableContent: 1,
        contentAvailable: 1,
        pushType: 'alert',
        category: content.category || '',
    });

    if (content.silent) {
        note.contentAvailable = 1;
        note.mutableContent = 1;
        note.pushType = 'background';
        note.payload.silent = true;
        note.payload.alert = { title: content.title, body: content.body };
        note.priority = 5;
        note.sound = '';
        delete note.alert;
        delete note.badge;
    }

    const message = new gcm.Message({
        collapseKey: chatId,
        priority: 'high',
        contentAvailable: false,
        timeToLive: 28 * 86400,
        data: content.custom,
    });

    return { iOSContent: note, androidContent: message };
};

module.exports = PushNotificationService;
