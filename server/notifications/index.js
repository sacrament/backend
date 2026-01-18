
const PushNotifications = require('node-pushnotifications');
const config = require('../utils/config')
const ChatService = require('../services/domain/chat/chat.service');
const UserService = require('../services/domain/user/user.service');
const mongoose = require('mongoose');
const ChatModel = mongoose.model('Chat');
const UserModel = mongoose.model('User');
const path = require('path');
const apn = require('apn');

let certsPathFolder = path.resolve(__dirname);
certsPathFolder = certsPathFolder.replace("notifications", "");

const gcm = require('node-gcm');
// The push notification instance/provider
// var push;

class PushNotificationService {
    constructor() {
        setup();
    }

    newMessage(content) {
        return newMessage(content);
    }

    newChatMemberAdded(content) {
        return newChatMemberAdded(content);
    }

    membersRemovedFromChat(content) {
        return membersRemovedFromChat(content);
    }

    chatDeleted(content) {
        return chatDeleted(content);
    }

    memberLeftChat(content) {
        return memberLeftChat(content);
    }

    messageDeleted(content) {
        return messageDeleted(content);
    }

    reactOnMessage(content) {
        return reactOnMessage(content)
    }

    incomingCall(content) {
        return incomingCall(content);
    }

    endCall(content) {
        return endCall(content);
    }

    missedCall(content) {
        return missedCall(content);
    }

    markConversationSeen(content) {
        return markConversationSeen(content)
    }

    markMessageReceived(content) {
        return markMessageReceived(content)
    }

    markMessageSeen(content) {
        return markMessageSeen(content)
    }

    groupChatEdited(content) {
        return groupChatEdited(content)
    }

    blockChat(content) {
        return blockChat(content)
    }

    newConnectionRequest(from, request, to) {
        return newConnectionRequest(from, request, to);
    }

    respondConnectionRequest(from, to, request, response) {
        return respondConnectionRequest(from,request, to,response);
    }

    cancellConnectionRequest(request) {
        return cancellConnectionRequest(request)
    }

    undoConnectionFriendship(from, request, to) {
        return undoConnectionFriendship(from, request, to);
    }

    reminderForConnectionRequest(from, request, to) {
        return reminderForConnectionRequest(from, request, to);
    }
}

const setup = () => {
    console.log(`Environment push: ${config.ENV_NAME}`);

    // push = new PushNotifications(settings);
}

const settings = {
    token: {
        key: path.resolve(certsPathFolder, "certs/AuthKey_2XCWJRBL6T.p8"),////path.resolve(__dirname,"certs/token.p8")  
        keyId: config.IOS_KEY_TOKEN,
        teamId: config.IOS_TEAM_ID,
    },
    production: config.ENV_NAME === 'production'
    // production: true
};

const apnProvider = new apn.Provider(settings);

/**
 * Total unread messages for user for a given chat
 *
 * @param {*} chatId
 * @param {*} userId
 * @returns
 */
const getUnreadMessagesForChatForUser = (chatId, userId) => {
    const chatService = new ChatService(ChatModel);
    return chatService.countUnreadMessagesForChat(chatId, userId);
}

const getUnreadMessagesForUser = (userId) => {
    const chatService = new ChatService(ChatModel);
    return chatService.countUnreadMessagesForUser(userId);
}

const getUnreadChatsForUser = (userId) => {
    const chatService = new ChatService(ChatModel);
    return chatService.countTotalUnreadChatsForUser(userId);
}

const getUserDetails = (userId) => {
    const userService = new UserService(UserModel);
    return userService.getUserById(userId, true)
}

/**
 * Send a push notification for a new chat message
 *
 * @param {*} content
 */
const newMessage = async (content) => {
    try {
        console.log(`Sending push for new message`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message._doc;
        const chat = content.chat;
        let from = content.from;
        delete from.token;

        let data = {};

        if (message.kind == 'text') {
            data = {
                body: message.content
            };
        } else {
            data = {
                body: `${message.kind}`
            };
        }
        // Get the details for the sender  

        if (chat.type == 'group') {
            data.title = from.name + ' @ ' + chat.name
        } else {
            data.title = from.name
        }

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;
        delete from.device;

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            // chat: chat,
            message: message,
            fromUser: from,
            save: 1,
            newMessage: true
        }; 

        data.category = 'NewMessage';

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat new message push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for new message: ${ex.message}`)
    }
}

/**
 * When the admin or creator invites/adds new member toa group and a generic message is sent to all participants
 *
 * @param {*} content
 */
const newChatMemberAdded = async (content) => {
    try {
        console.log(`Sending push for new member added to chat`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.genericMessage;
        const chat = content.chat;
        const from = content.from;
        const newMembers = content.newMembers;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {
            body: 'New members were added',
            title: chat.name
        };

        // Get the details for the sender 

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            save: 1,
            message: message,
            fromUser: from,
            newMembers: newMembers,
            newMember: true
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat new members added push notification: ${JSON.stringify(result)}`);

        /* 
        // // Wait for all users to return the promise
        const resultFromPush = await Promise.all(promises);
        console.log(`Result from add new members: ${JSON.stringify(resultFromPush, undefined, 14)}`); 
        */
    } catch (ex) {
        console.error(`Error while sending push notification for new member added to chat. Error: ${ex.message}`)
    }
}

/**
 * Member was removed from chat by admin
 *
 * @param {*} content
 */
const membersRemovedFromChat = async (content) => {
    try {
        console.log(`Sending push for members removed from chat`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.genericMessage;
        const chat = content.chat;
        const from = content.from;
        const removedMembers = content.removedMembers;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {
            body: 'Members were removed from chat',
            title: chat.name
        };

        // Get the details for the sender 

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            save: 1,
            message: message,
            fromUser: from,
            removedMembers: removedMembers,
            memberRemoved: true
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat members were removed push notification: ${JSON.stringify(result)}`);

        /*
        
        // // Wait for all users to return the promise
        const resultFromPush = await Promise.all(promises);
        console.log(`Result from remove members from chat: ${JSON.stringify(resultFromPush, undefined, 14)}`); 
        */
    } catch (ex) {
        console.error(`Error while sending push notification for remove members from chat. Error: ${ex.message}`)
    }
}

/**
 * Notification for chat deleted
 *
 * @param {*} content
 */
const chatDeleted = async (content) => {
    try {
        console.log(`Sending push for new member added to chat`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message;
        const chat = content.chat;
        const from = content.from;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {
            body: "Deleted",
            title: chat.name
        };

        // Get the details for the sender 

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            message: message,
            fromUser: from,
            deleted: true
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat deleted push notification: ${JSON.stringify(result)}`);
        /*
        const pushContent = prepareData(data)

        const promises = offlineReceivers.map(async (user) => {
            // Get total unread chats for user
            const totalUnread = await getUnreadChatsForUser(user._id.toString())
            pushContent.badge = totalUnread;
            // console.log(`totalUnread member: ${JSON.stringify(pushContent.badge)}`)

            // get total unread messages for chat
            // const totalUnreadChat = await getUnreadMessagesForChatForUser(chat._id.toString(), user._id.toString());
            pushContent.custom.chat.unreadMessages = 0;
            // console.log(`totalUnreadChat member: ${JSON.stringify(totalUnreadChat)}`) 
            // console.log(`Current member: ${JSON.stringify(user.device.token)}`)
 
            const result = await send(user.device.token, pushContent);

            return result;
        });
    
        // // Wait for all users to return the promise
        const resultFromPush = await Promise.all(promises);
        console.log(`Result from deleted chat: ${JSON.stringify(resultFromPush, undefined, 14)}`); 
        */
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for delete chat. Error: ${ex.message}`)
    }
}

/** 
 * Member left the chat
 * 
 * @param {*} content
 */
const memberLeftChat = async (content) => {
    try {
        console.log(`Sending push for member left chat`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message;
        const chat = content.chat;
        const from = content.from;

        delete from.token;
        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        // Get the details for the sender
        const userLeft = await getUserDetails(from.id);
        from.name = userLeft.name;

        let data = {
            body: userLeft.name + " left the group",
            title: chat.name
        };

        // Get the details for the sender 

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            save: 1,
            message: message,
            fromUser: from,
            memberLeftChat: true
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat member left push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for left chat. Error: ${ex.message}`)
    }
}

const blockChat = async (content) => {
    try {
        console.log(`Sending push for block chat`)
        const offlineReceivers = content.offlineReceivers;
        const blockStatus = content.blockStatus;
        const chat = content.chat;
        const from = content.from;

        delete from.token;

        let data = {};

        data.silent = true;

        // Get the details for the sender 

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            save: 1,
            fromUser: from,
            blockChat: true,
            blockStatus: blockStatus
        }

        const result = await processSilentNotification(data, offlineReceivers);
        console.log(`Chat member blocked push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for block chat. Error: ${ex.message}`)
    }
}

/**
 * Message is deleted
 * 
 * @param {*} content
 */
const messageDeleted = async (content) => {
    try {
        console.log(`Sending push notification for message deleted`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message;
        const chat = content.chat;
        const from = content.from;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {};

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            message: message,
            fromUser: from,
            deleted: true
        }

        data.body = 'Deleted a message'

        if (!from.name) {
            const userFrom = await getUserDetails(from.id);
            from.name = userFrom.name;
        }

        if (chat.type == 'group') {
            data.title = from.name + ' @ ' + chat.name
        } else {
            data.title = from.name
        }

        data.silent = true;

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat message deleted push notification: ${JSON.stringify(result)}`);

        /*
        const pushContent = prepareData(data)

        const promises = offlineReceivers.map(async (user) => {
            // Get total unread chats for user
            const totalUnread = await getUnreadChatsForUser(user._id.toString())
            pushContent.badge = totalUnread;
            // console.log(`totalUnread member: ${JSON.stringify(pushContent.badge)}`)

            // get total unread messages for chat
            const totalUnreadChat = await getUnreadMessagesForChatForUser(chat._id.toString(), user._id.toString());
            pushContent.custom.chat.unreadMessages = totalUnreadChat; 
 
            const result = await send(user.device.token, pushContent);

            return result;
        });
    
        // // Wait for all users to return the promise
        const resultFromPush = await Promise.all(promises);
        console.log(`Result from add new members: ${JSON.stringify(resultFromPush, undefined, 14)}`); 
        */
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for 'message deleted'. Error: ${ex.message}`)
    }
}

/**
 * Message reaction
 *
 * @param {*} content
 */
const reactOnMessage = async (content) => {
    try {
        console.log(`Sending push notification for message reaction`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message;
        const chat = content.chat;
        const from = content.from;
        const reaction = content.reaction;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {};

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type
            },
            save: 1,
            messageId: message._id,
            reaction: reaction,
            fromUser: from,
            isReact: true
        }

        data.body = 'Reacted on a message'
        let sender = from;

        if (typeof sender === 'string') {
            sender = await getUserDetails(from.id);
        }

        from.name = sender.name;

        if (chat.type == 'group') {
            data.title = from.name + ' @ ' + chat.name
        } else {
            data.title = from.name
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Chat message reaction push notification: ${JSON.stringify(result)}`);

    } catch (ex) {
        console.error(`Error while preparing/sending push notification for message reaction. Error: ${ex.message}`)
    }
}

/**
 * this is only for android 
 *
 * @param {*} content
 */
const incomingCall = async (content) => {
    try {
        console.log(`Sending push for new call`)
        const to = content.to._doc;
        const callToken = content.token;
        const call = content.call;
        const from = content.from._doc;
        const chat = content.chat;

        // Get the details for the sender 
        delete from.device;

        const data = {
            body: from.name,
            title: "Incoming call",
            custom: {
                token: callToken,
                call: call,
                fromUser: from,
                mode: content.mode
            }
        };

        const result = await processNotification(data, [to]);
        console.log(`Call Push Result: ${JSON.stringify(result, undefined, 4)}`);
    } catch (ex) {
        console.error(`Error sending push for new call: ${ex.message}`)
    }
}

/**
 * Missed Call 
 *
 * @param {*} content
 */
const missedCall = async (content) => {
    try {
        console.log(`Sending push for missed call`)
        const to = content.to;
        // const callToken = content.token;
        const call = content.call;
        const from = content.from;
        // const chat = content.chat;

        // Get the details for the sender 
        delete from.device;

        const data = {
            body: from.name,
            title: "Missed call",
            category: "VOIPMissedCall",
            custom: {
                // token: callToken,
                call: call,
                fromUser: from,
                mode: content.mode,
                missedCall: true
            }
        };

        const result = await processNotification(data, [to]);
        // const result = await processSilentNotification(data, [to]);
        console.log(`Missed Call Push Result: ${JSON.stringify(result, undefined, 4)}`);
    } catch (ex) {
        console.error(`Error sending push for missed call: ${ex.message}`)
    }
}

const endCall = async (content) => {
    try {
        console.log(`Sending push for end call`)
        const to = content.to;
        // const callToken = content.token;
        const call = content.call;
        const from = content.from;
        const chat = content.chat;

        // Get the details for the sender 
        delete from.device;

        const data = {
            body: from.name,
            title: "Call ended",
            category: "VOIPCallEnded",
            custom: {
                // token: callToken,
                call: call,
                fromUser: from,
                mode: content.mode,
                end: true
            }
        };

        const result = await processNotification(data, [to]);
        // const result = await processSilentNotification(data, [to]);
        console.log(`End Call Push Result: ${JSON.stringify(result, undefined, 4)}`);
    } catch (ex) {
        console.error(`Error sending push for end call: ${ex.message}`)
    }
}
/**
 *
 *
 * @param {*} content
 */
const markMessageReceived = async (content) => {
    try {
        console.log(`Sending push notification for mark message receoved`)
        const offlineReceivers = content.offlineReceivers;
        // this is the chatId
        const messageId = content.messageId;
        // from id
        const from = content.by;
        const date = content.date;

        let data = {};

        data.custom = {
            messageId: messageId,
            fromUser: from,
            messageDelivered: true,
            date: date
        }

        data.silent = true;

        const result = await processSilentNotification(data, offlineReceivers);
        console.log(`Chat mark message delieverd push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for mark message delivered: ${ex.message}`)
    }
}

/**
 *
 *
 * @param {*} content
 */
const markMessageSeen = async (content) => {
    try {
        console.log(`Sending push notification for mark message seen`)
        const offlineReceivers = content.offlineReceivers;
        // this is the chatId
        const messageId = content.messageId;
        // from id
        const from = content.by;
        const date = content.date;

        let data = {};

        data.custom = {
            messageId: messageId,
            fromUser: from,
            messageSeen: true,
            date: date
        }

        data.silent = true;

        const result = await processSilentNotification(data, offlineReceivers);
        console.log(`Chat mark message seen push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for mark message seen: ${ex.message}`)
    }
}

/**
 *
 *
 * @param {*} content
 */
const markConversationSeen = async (content) => {
    try {
        console.log(`Sending push notification for mark conversation seen`)
        const offlineReceivers = content.offlineReceivers;
        // this is the chatId
        const chatId = content.chat;
        // from id
        const from = content.by;
        const date = content.date;

        let data = {};

        data.custom = {
            chatId: chatId,
            fromUser: from,
            markConversationSeen: true,
            date: date
        }

        data.silent = true;

        const result = await processSilentNotification(data, offlineReceivers);
        console.log(`Chat mark conversation push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error while preparing/sending push notification for mark conversation seen: ${ex.message}`)
    }
}

/**
 * Group chat edited
 *
 * @param {*} content
 */
const groupChatEdited = async (content) => {
    try {
        console.log(`Sending push for group chat edited`)
        const offlineReceivers = content.offlineReceivers;
        const message = content.message;
        const chat = content.chat;
        const from = content.from;

        delete message.status;
        delete message.deleted;
        delete message.uniqueId;
        delete message.editedOn;
        delete message.summary;

        let data = {
            body: 'Group chat edited',
            title: chat.name
        };

        data.custom = {
            chat: {
                id: chat._id.toString(),
                unreadMessages: 0,
                name: chat.name,
                type: chat.type,
                imageUrl: chat.imageUrl
            },
            save: 1,
            message: message,
            fromUser: from,
            chatEdited: true
        }

        const result = await processNotification(data, offlineReceivers);
        console.log(`Group chat edited push notification: ${JSON.stringify(result)}`);

        /* 
        // // Wait for all users to return the promise
        const resultFromPush = await Promise.all(promises);
        console.log(`Result from add new members: ${JSON.stringify(resultFromPush, undefined, 14)}`); 
        */
    } catch (ex) {
        console.error(`Error while sending push notification for Group chat edited. Error: ${ex.message}`)
    }
}

/*
 *****************************CONNECTION REQUESTS******************************
*/

/**
 * COnnection REquest
 *
 * @param {*} from
 * @param {*} request
 * @param {*} to
 */
const newConnectionRequest = async (request) => {
    try {
        console.log(`Sending push for new connection request`);
 
        let data = {
            body: 'Sent you a connection request',
            title: from.name
        };

        data.custom = {
            request: request,
            fromUser: request.from,
            save: 1,
            isConnectionRequest: true
        };

        data.category = 'NewConnectionRequest';

        const result = await processNotification(data, [request.to]);
        console.log(`New connection request push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for New connection request: ${ex.message}`)
    }
}

/**
 * Respond connection request
 *
 * @param {*} from
 * @param {*} request
 * @param {*} to
 * @param {*} response
 */
const respondConnectionRequest = async (from, request, to, response) => {
    try {
        console.log(`Sending push for respond connection request`);
 
        let data = {
            body: response == 'accepted' ? "Accepted your request" : 'Declined your request',
            title: from.name
        };

        data.custom = {
            request: request,
            fromUser: from,
            save: 1,
            respondConnetionRequest: true,
            response: response
        };

        data.category = 'RespondConnectionRequest';

        const result = await processNotification(data, [to]);
        console.log(`respondConnectionRequest push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for new message: ${ex.message}`)
    }
}

/**
 * Cancel connection request
 *
 * @param {*} from
 * @param {*} request
 */
const cancellConnectionRequest = async (request) => {
    try {
        console.log(`Sending push for cancel connection request`);
 
        let data = {
            // body: 'Connection request was cancelled',
            // title: from.name
        };

        data.custom = {
            request: request,
            fromUser: request.from,
            save: 1,
            cancelConnetionRequest: true
        };

        data.category = 'CancelConnectionRequest';

        const result = await processSilentNotification(data, [request.to]);
        console.log(`cancellConnectionRequest push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for cancel connection request: ${ex.message}`)
    }
}

/**
 * Undo friendship
 *
 * @param {*} from
 * @param {*} request
 */
const undoConnectionFriendship = async (from, request, to) => {
    try {
        console.log(`Sending push for undo connection friendship`);
 
        let data = {
            // body: 'Connection request was cancelled',
            // title: from.name
        };

        data.custom = {
            request: request,
            fromUser: from,
            save: 1,
            undoConnectionFriendship: true
        };

        data.category = 'UndoConnectionFriendship';

        const result = await processSilentNotification(data, [to]);
        console.log(`cancellConnectionRequest push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for cancel connection request: ${ex.message}`)
    }
}

/**
 * REminder for non responded connection request
 *
 * @param {*} from
 * @param {*} request
 * @param {*} to
 */
const reminderForConnectionRequest = async (from, request, to) => {
    try {
        console.log(`Sending push for reminder connection request`);
 
        let data = {
            body: from.name + ' sent you a connection request',
            title: "Connection request reminder"
        };

        data.custom = {
            request: request,
            fromUser: from,
            save: 1,
            isConnectionRequestReminder: true
        };

        data.category = 'ReminderConnectionRequest';

        const result = await processNotification(data, [to]);
        console.log(`Reminder connection request push notification: ${JSON.stringify(result)}`);
    } catch (ex) {
        console.error(`Error sending push for reminder connection request: ${ex.message}`)
    }
}

/**
 *************************************************************
 ************************ PRIVATE FUNCTIONS ******************
 *************************************************************
 */

/**
 * Process push notification
 *
 * @param {*} data
 * @param {*} users
 */
const processNotification = async (data, users) => {
    const { iOSContent, androidContent } = prepareData(data)

    const promises = users.map(async (member) => {
        const user = member.user || member;
        const userOptions = member.options || null;

        // Get total unread chats for user
        let totalUnread = await getUnreadMessagesForUser(user._id.toString());

        if (data.custom.isReact) {
            totalUnread += 1;
            iOSContent.aps.badge = totalUnread
        } else if (data.custom.isConnectionRequest) {
            totalUnread += 1;
            iOSContent.aps.badge = totalUnread
        } else if (data.custom.respondConnetionRequest) {
            totalUnread += 1;
            iOSContent.aps.badge = totalUnread
        }

        iOSContent.badge = totalUnread
        // const totalChatsUnread = await getUnreadChatsForUser(user._id.toString());
        // iOSContent.payload.totalChatsUnread = totalChatsUnread

        // this is android 
        androidContent.addData('badge', totalUnread);
        // androidContent.addData('totalChatsUnread', totalChatsUnread);
        // console.log(`totalUnread member: ${JSON.stringify(iOSContent.badge)}`)


        // get total unread messages for chat
        // if (data.custom.chat) {
        //     const chatId = data.custom.chat.id || data.custom.chat._id;
        //     const totalUnreadChat = await getUnreadMessagesForChatForUser(chatId.toString(), user._id.toString());
        //     iOSContent.payload.chat.unreadMessages = totalUnreadChat;

        //     // this is android 
        //     androidContent.addData('unreadMessages', totalUnreadChat);
        // }

        // console.log(`totalUnreadChat member: ${JSON.stringify(totalUnreadChat)}`) 

        const correctData = (user.device.type === 'IOS' ? iOSContent : androidContent)

        if (data.custom.message) {
            if (data.custom.message.kind == 'image' || data.custom.message.kind == 'video') {
                if (user.device.type === 'IOS') {
                    correctData.payload.message.media[0].thumbnail = ''
                } else {
                    correctData.params.data.message.media[0].thumbnail = ''
                }
            }
        }

        if (userOptions && userOptions.muted) {
            iOSContent.priority = 5
            iOSContent.sound = ""
            iOSContent.contentAvailable = 1;
            iOSContent.mutableContent = 0;
            iOSContent.pushType = 'background';
            iOSContent.payload.silent = true
            iOSContent.payload.alert = data.alert;

            delete iOSContent.aps.alert;
            delete iOSContent.aps.badge;
            delete iOSContent.badge;
            delete iOSContent.aps.title;
            delete iOSContent.aps.body;
            delete iOSContent.aps.sound;
        }

        const payloadSize = JSON.stringify(correctData).length;

        console.log(`Payload Size: ${payloadSize} bytes`);

        if (payloadSize > 3900) {
            correctData.payload.save = 0;

            if (correctData.payload.message) {
                correctData.payload.message = {
                    _id: correctData.payload.message._id,
                    content: correctData.payload.message.content,
                    mediaUrl: (correctData.payload.message.media.length ? correctData.payload.message.media[0].url : ""),
                    kind: correctData.payload.message.kind,
                    chatId: correctData.payload.message.chatId
                }
            }
        }

        if (user.device.type == "ANDROID") {
            return await sendAndroid(user.device.token, correctData);
        } else {
            return await sendIOS(user.device.token, correctData);
        }
    });

    // // Wait for all users to return the promise
    const resultFromPush = await Promise.all(promises);
    // console.log(`Result from push notification: ${JSON.stringify(resultFromPush)}`); 

    return resultFromPush;
}

/**
 *
 *
 * @param {*} data
 * @param {*} users
 * @returns
 */
const processSilentNotification = async (data, users) => {
    const { iOSContent } = prepareData(data)

    const promises = users.map(async (id) => {
        let userId = id;
        if (typeof id !== 'string') {
            if (id.user) {
                userId = id.user.toString()
            } else {
                userId = id._id.toString()
            }
        }

        const user = await getUserDetails(userId);

        return await sendIOS(user.device.token, iOSContent);
    });

    // // Wait for all users to return the promise
    const resultFromPush = await Promise.all(promises);
    console.log(`Result from SILENT push notification: ${JSON.stringify(resultFromPush)}`);

    return resultFromPush;
}

/**
 * Send the push to the tokens 
 *
 * @param {*} tokens
 * @param {*} content
 */
const sendIOS = async (tokens, content) => {
    return new Promise((resolve) => {
        // const push = new PushNotifications(settings);
        // push.send(tokens, content)
        apnProvider.send(content, tokens)
            .then(res => {

                if (res.sent.length > 0) {
                    const result = res.sent[0];
                    // console.log(`Success Result: ${JSON.stringify(result.message, undefined, 14)}`) 
                    resolve({ sent: result })
                }

                if (res.failed.length > 0) {
                    const result = res.failed[0];
                    // console.log(`Failure Result: ${JSON.stringify(result.message, undefined, 14)}`)
                    resolve({ failed: result })
                }
            }).catch(err => {
                console.error(`Error sending push: ${JSON.stringify(err, undefined, 14)}`)
                resolve({ error: err })
            });
    });
}

const sendAndroid = async (tokens, content) => {
    const sender = new gcm.Sender(config.GCM_SERVER_ID)
    return new Promise((resolve) => {
        sender.send(content, [tokens], (err, response) => {
            if (err) {
                console.error(err);
                resolve({ failed: err.message });
            } else {
                const result = response.results[0];

                if (response.failure > 0) {
                    resolve({ failed: result })
                } else {
                    console.log(response);
                    resolve({ sent: result })
                }
            }
        });
    });
}

/**
 * Prepare push notification payload
 *
 * @param {*} content
 * @returns
 */
const prepareData = (content) => {
    try {
        const data = {
            title: content.title, // REQUIRED for Android
            topic: config.IOS_BUNDLE, // REQUIRED for iOS (apn and gcm)
            /* The topic of the notification. When using token-based authentication, specify the bundle ID of the app.
             * When using certificate-based authentication, the topic is usually your app's bundle ID.
             * More details can be found under https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/sending_notification_requests_to_apns
             */
            body: content.body,
            custom: content.custom,
            priority: 'high', // gcm, apn. Supported values are 'high' or 'normal' (gcm). Will be translated to 10 and 5 for apn. Defaults to 'high'
            collapseKey: (content.custom.chat != undefined ? content.custom.chat.id : ''), // gcm for android, used as collapseId in apn
            contentAvailable: false, // gcm, apn. node-apn will translate true to 1 as required by apn.
            // delayWhileIdle: true, // gcm for android
            // restrictedPackageName: '', // gcm for android
            // dryRun: false, // gcm for android
            // icon: '', // gcm for android
            // image: '', // gcm for android
            // style: '', // gcm for android
            // picture: '', // gcm for android
            // tag: '', // gcm for android
            // color: '', // gcm for android
            // clickAction: '', // gcm for android. In ios, category will be used if not supplied 
            retries: 10, // gcm, apn
            encoding: '', // apn
            badge: content.badge == 0 ? 1 : content.badge, // gcm for ios, apn
            sound: 'default', // gcm, apn
            // android_channel_id: '', // gcm - Android Channel ID
            alert: { // apn, will take precedence over title and body
                title: content.title,
                body: content.body
                // details: https://github.com/node-apn/node-apn/blob/master/doc/notification.markdown#convenience-setters
            },
            /*
             * A string is also accepted as a payload for alert
             * Your notification won't appear on ios if alert is empty object
             * If alert is an empty string the regular 'title' and 'body' will show in Notification
             */
            // alert: '',
            launchImage: '', // apn and gcm for ios
            action: '', // apn and gcm for ios
            category: content.category || '', // apn and gcm for ios
            // mdm: '', // apn and gcm for ios. Use this to send Mobile Device Management commands.
            // https://developer.apple.com/library/content/documentation/Miscellaneous/Reference/MobileDeviceManagementProtocolRef/3-MDM_Protocol/MDM_Protocol.html
            // urlArgs: '', // apn and gcm for ios
            truncateAtWordEnd: true, // apn and gcm for ios
            mutableContent: 1, // apn
            threadId: (content.custom.chat != undefined ? content.custom.chat.id : ''), // apn
            pushType: 'alert', // apn. valid values are 'alert' and 'background' (https://github.com/parse-community/node-apn/blob/master/doc/notification.markdown#notificationpushtype)
            expiry: Math.floor(Date.now() / 1000) + 28 * 86400, // unit is seconds. if both expiry and timeToLive are given, expiry will take precedence
            timeToLive: 28 * 86400
        };

        const note = new apn.Notification({
            expiry: Math.floor(Date.now() / 1000) + 3600,// Expires 1 hour from now.
            badge: content.badge,
            sound: "ping.aiff",
            alert: data.alert,
            payload: content.custom,
            topic: config.IOS_BUNDLE,
            mutableContent: 1,
            contentAvailable: 1,
            pushType: 'alert',
            category: content.category || ''
        });

        if (content.silent) {
            // data.priority = 5; // This is important 
            // data.expiry = Math.floor(Date.now() / 1000) + 36000; 
            // data.contentAvailable = 1;
            // data.mutableContent = 1;
            // data.pushType = 'background';
            // data.custom.alert = data.alert;
            // data.custom.silent = true;

            // delete note.alert;
            // delete data.alert;
            // delete data.badge;
            // delete data.title;
            // delete data.body;

            note.contentAvailable = 1;
            note.mutableContent = 1;
            note.pushType = 'background';
            note.payload.silent = true
            note.payload.alert = data.alert;
            note.priority = 5;
            note.sound = "";

            delete note.alert;
            delete note.badge;
            delete note.title;
            delete note.body;
            delete note.sound;
        }

        const message = new gcm.Message({ // See https://developers.google.com/cloud-messaging/http-server-ref#table5
            collapseKey: (content.custom.chat != undefined ? content.custom.chat.id : ''),
            priority: 'high',
            contentAvailable: false,
            timeToLive: 28 * 86400,
            data: content.custom
        });

        return { iOSContent: note, androidContent: message };
    } catch (ex) {
        console.error(`Error while preparing push notification payload: ${ex.message}`);
        throw ex;
    }
}

module.exports = PushNotificationService;