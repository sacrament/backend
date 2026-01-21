const utils = require('../../../utils/index'); 
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const ChatModel = mongoose.model('Chat');
const MessageModel = mongoose.model('Message'); 
const ChatServiceDB = require('../../services/domain/chat/chat.service.db');
const MessageServiceDB = require('../../services/domain/chat/message.service.db');
const { UserService, ChatService, CallService, ContactService } = require('../../services');
const { getChatService } = require('../services');
const PushNotificationService = require('../../notifications');

// Get ChatService from singleton manager
const chatSocketService = getChatService(); 

module.exports = class Chat {
    constructor() {  
        
        this.handler = {
            'new chat': newChat,
            'edit chat': editChat,
            // 'add new chat members': newChatMembers,
            // 'remove members from chat': removeMembersFromChat,
            'new message': newMessage,
            'react on message': reactOnMessage,
            'delete message': deleteMessage,
            'delete chat': deleteChat,
            'leave chat': leaveChat,
            'favorite chat': favoriteChat,
            'block chat': blockChat,
            // 'mute chat': muteChat,
            'message seen': messageSeen,
            'message received': messageDelivered,
            'chat messages': messages,
            'all chats': allChats,
            // Set Typing
            'start typing': startTyping,
            'stop typing': stopTyping,
            'total unread chats': totalUnreadChats,
            'mark conversation seen': markConversationSeen,
            'exchange info': exchangeInfo,
            'clear chat': clearChat
        };

        // setup the chat model and message model 
    };
}

/**
 *
 * When someone creates a new chat
 * @param {*} data
 * @param {*} ack
 */
const newChat = async function(data, ack) {
    try {
        console.log(`New Chat: ${JSON.stringify(data)}`)

        const chatService = new ChatServiceDB(ChatModel);
        const from = this.user.id;
        data.userId = from;
        // const tempChat = await chatService.create(data);
        // Do something with the newly chat object
        // the temp chat is in memory object, not stored to db
    
        chatService.create(data).then((result) => {
            //MARK: Get the socket for the user
            // const userSocket = getSocketForUser.bind(this, from);
            // this.to(`${userSocket}`).emit('new chat created', {
            //     chat: result.chat
            // }) 
            ack(result);
        }).catch((err) => {
            //MARK: Get the socket for the user
            // const userSocket = getSocketForUser.bind(this, from);
            // this.to(`${userSocket}`).emit('chat not created', {
            //     error: err
            // })
    
            ack({error: err.message});
        })
    } catch (ex) {
        ack(ex.message);
    } 
};


/**
 *
 * Edit an existing chat
 * @param {*} data
 * @param {*} ack
 * * TODO: Need  to finish the push notifiation
 */
const editChat = async function(data, ack) {
    try {
        console.log(`Edit Chat: ${JSON.stringify(data)}`)
        const from = this.user;
        const userId = this.user.id;

        const chatService = new ChatServiceDB(ChatModel);
        // Userservice
        const userService = new UserService(UserModel);
        // For push notifications
        var offlineUsers = [];

        chatService.edit(data.chat).then(async (result) => {
            // Get user details
            const userFrom = await userService.getUserById(userId, true);
            // init message service
            const messageService = new MessageServiceDB(MessageModel);
            // create a generic message
            const genericMessage = messageService.createGeneric(`${userFrom.name} edited group chat`, data.chat.id, userId);
            // save the message
            messageService.save(genericMessage);
             
            const update = await chatService.setLatestMessage(data.chat.id, genericMessage._id, userId);
            const chat = update.chat;
            //MARK: Get the socket for the user
            const members = chat.members.filter(member => member.user._id != userId);
            for (const member of members) {
                const to = member._id.toString();
                const isUserConnected = await chatSocketService.isUserConnected(to);
                if (isUserConnected) {
                    this.to(to).emit('chat edited', {
                        chat: chat,
                        message: genericMessage
                    });
                } else {
                    offlineUsers.push(member);
                }
            } 
            ack({title: 'Chat edited', chat: chat, message: genericMessage });
            if (offlineUsers.length) { 
                // Send the push notifications  
                const data = { chat: chat, message: genericMessage, from: from, offlineReceivers: offlineUsers };
                // result.from = from;

                const pushNotification = new PushNotificationService();
                pushNotification.groupChatEdited(data);
            }
        }).catch((err) => { 
            console.error(`[ERROR]:${err.message}`);
            ack({error: err.message});
        });
    } catch (ex) {
        console.error(`[ERROR]:Generic ${ex.message}`);
        ack(ex.message);
    } 
}

/**
 *
 * add new member to a chat
 * @param {*} data
 * @param {*} ack
 */
const newChatMembers = async function(data, ack) { 
    try {
        console.log(`New chat member: ${JSON.stringify(data)}`)
        const from = this.user;
        const userService = new UserService(UserModel);
        let newUsers = await userService.getUserIds(data.chat.newMembers);
      
        const chatService = new ChatServiceDB(ChatModel); 
        if (typeof newUsers === 'string') {  
            newUsers = [newUsers]
        }
     
        chatService.newMembers(data.chat.id, newUsers, from.id)
        .then(async(result) => {
            // const chat = result.chat;
            if (result.exists) {
                return new Promise((resolve) => {
                    const obj = { chat: chat, offlineReceivers: [], newlyAdded: [], title: "Member is already in the chat" };
                    ack(obj);
                    resolve(obj)
                });
            }

            const userFrom = await userService.getUserById(from.id, true)
            // get current chat members, to notify that a new members has been added
            // const chatMembers = await chatService.getChatMembers(data.chat.id);
            const messageService = new MessageServiceDB(MessageModel);
            const genericMessage = messageService.createGeneric(`${userFrom.name} added new members to the group`, data.chat.id, from.id)
            messageService.save(genericMessage);
            
            const chatServiceDB = new ChatServiceDB(ChatModel);
            const update = await chatServiceDB.setLatestMessage(data.chat.id, genericMessage._id, from.id);
            const chat = update.chat;
          
            // Skip the client
            const members = chat.members;
            var offlineReceivers = [];

            for (const member of members) {
                if (!member.canChat) continue;

                const to = member.user._id.toString();

                if (to == from.id) continue;
                
                const isUserConnected = await chatSocketService.isUserConnected(to);

                if (isUserConnected) {
                    // Send the message to online users
                    this.to(to).emit('new chat member added', {
                        chat: chat,
                        newMembers: newUsers,
                        genericMessage: genericMessage,
                        userFrom: userFrom
                    });
                } else {
                    // if (!member.options.muted) { 
                        /// Offline people. Send a push notification
                        offlineReceivers.push(member);
                    // }
                }
            }

            const obj = { genericMessage: genericMessage, chat: chat, offlineReceivers: offlineReceivers, newMembers: newUsers };
            ack(obj);

            return new Promise((resolve) => {
                resolve(obj)
            });
        }).then(result => { 
            if (result.offlineReceivers.length) { 
                // Send the push notifications 
                const pushNotification = new PushNotificationService();
                result.from = from;
                pushNotification.newChatMemberAdded(result);
            } else {
                console.log(`No offline users`)
            }
        }).catch((err) => { 
            ack(err.message);
        });
    } catch (ex) {
        ack(ex.message);
    } 
}

/**
 * Remove current members from the chat
 *
 * @param {*} data
 * @param {*} ack
 */
const removeMembersFromChat = async function(data, ack) {
    try {
        console.log(`Remove chat member: ${JSON.stringify(data)}`)
        const from = this.user;
        const userService = new UserService(UserModel);
        let usersToRemove = await userService.getUserIds(data.chat.membersToRemove);
      
        const chatService = new ChatServiceDB(ChatModel); 
        if (typeof usersToRemove === 'string') {    
            usersToRemove = [usersToRemove]
        }

        chatService.removeMembers(data.chat.id, usersToRemove).then(async chat => {
            const userFrom = await userService.getUserById(from.id, true)
            const messageService = new MessageServiceDB(MessageModel);
            const genericMessage = messageService.createGeneric(`${userFrom.name} removed members from the group`, chat._id, from.id)
            messageService.save(genericMessage);

            const removedUsers = await userService.getUsersBy(usersToRemove);

            const removed = removedUsers.map(member => member = {
                options: {
                    muted: false
                },
                user: member
            })
          
            // Skip the client
            const members = chat.members;
            // merge arrays 
            const mms = [...members, ...removed];
            var offlineReceivers = [];

            for (const member of mms) {
                // if (!member.canChat) continue;

                const to = member.user._id.toString();

                // if (to == from) continue;
                
                const isUserConnected = await chatSocketService.isUserConnected(to);

                if (isUserConnected) {
                    // Send the message to online users
                    this.to(to).emit('members removed from chat', {
                        chat: chat,
                        removeMembers: usersToRemove,
                        genericMessage: genericMessage,
                        userFrom: userFrom
                    });
                } else {
                    //MARK: Bug in here
                    /// Offline people. Send a push notification
                    // const options = member.options;

                    // if (options) {
                    //     if (!options.muted) { 
                    //         offlineReceivers.push(member.user);
                    //     }
                    // } else {
                        offlineReceivers.push(member);
                    // }
                }
            }

            const obj = { genericMessage: genericMessage, chat: chat, offlineReceivers: offlineReceivers, removedMembers: usersToRemove };
            ack(obj);

            return new Promise((resolve) => {
                resolve(obj)
            });
        }).then(result => {
            if (result.offlineReceivers.length) { 
                // Send the push notifications 
                const pushNotification = new PushNotificationService();
                result.from = from;
                pushNotification.membersRemovedFromChat(result);
            } else {
                console.log(`No offline users`)
            } 
        }).catch(err => {
            console.log(`Error while removing members: ${err.message}`)
            ack(err.message);
        })
    } catch (ex) {
        console.log(`Error occurred while removing members from chat: Error: ${ex.message}`)
        ack(ex.message);
    }
}

/**
 *
 * Delete chat group. Only admin/creator can delete the chat group
 * @param {*} data
 * @param {*} ack
 */
const deleteChat = async function(data, ack) {
    try {
        console.log(`Delete Chat: ${JSON.stringify(data)}`) 
        const from = this.user;

        const chatService = new ChatServiceDB(ChatModel); 
        chatService.deleteChat(data.chatId, from.id).then(async (result) => {
            //MARK: Get the socket for the user 
            var offlineUsers = [];

            const members = result.chat.members;
            console.log(`Total members: ${members.length}`)
            
            for (const member of members) {
                // CHeck if the member can chat, maybe they left the chat
                if (!member.canChat) continue;

                // Skip me
                if (member == from.id) continue;

                const to = member.user._id.toString();

                const isUserConnected = await chatSocketService.isUserConnected(to);

                if (isUserConnected) {
                    this.to(to).emit('chat deleted', {
                        chat: result.chat
                    });
                } else {
                    // if (!member.options.muted) { 
                        offlineUsers.push(member);
                    // }
                }
            }

            const obj = { chat: result.chat, offlineReceivers: offlineUsers};
            ack(obj);

            return new Promise((resolve) => {
                resolve(obj)
            });
        }).then(result => {
            // send the push notification to offline users
            if (result.offlineReceivers && result.offlineReceivers.length) {
                const pushNotification = new PushNotificationService();
                result.from = from;
                pushNotification.chatDeleted(result)
            }
        }).catch((err) => { 
            ack({error: err.message});
        });
    } catch (ex) {
        ack(ex.message);
    } 
}
/**
 * Clear chat history
 *
 * @param {*} data
 * @param {*} ack
 */
const clearChat = async function(data, ack) {
    try {
        // console.log(`Clear Chat: ${JSON.stringify(data)}`) 
        const from = this.user;

        const chatService = new ChatServiceDB(ChatModel); 
        chatService.clearChat(data.chatId, from.id)
        .then(async (result) => {  
            console.log('Result from clear: ', result.message)
            const obj = { chat: result.chat };
            ack(obj); 
        }).catch((err) => { 
            ack({error: err.message});
        });
    } catch (ex) {
        ack(ex.message);
    } 
}

//MARK: To be finished
/**
 *
 *
 * @param {*} data
 * @param {*} ack
 */
const leaveChat = async function(data, ack) {
    try {
        console.log(`Leave Chat: ${JSON.stringify(data)}`) 
        const from = this.user;

        const chatService = new ChatServiceDB(ChatModel); 
        chatService.leaveChat(from.id, data.chatId).then(async (result) => {
            //MARK: Get the socket for the user 
            var offlineUsers = [];
            // const chat = result.chat;
            const members = result.chat.members;
            // console.log(`Total members: ${members.length}`)
            const userService = new UserService(UserModel);
            const userFrom = await userService.getUserById(from.id, true)
            // get current chat members, to notify that a new members has been added
            // const chatMembers = await chatService.getChatMembers(data.chat.id);
            const messageService = new MessageServiceDB(MessageModel);
            const genericMessage = messageService.createGeneric(`${userFrom.name} left the group`, data.chatId, from.id)
            messageService.save(genericMessage);

            const chatServiceDB = new ChatServiceDB(ChatModel);
            const update = await chatServiceDB.setLatestMessage(data.chatId, genericMessage._id, from.id);
            const chat = update.chat;

            for (const member of members) {
                // CHeck if the member can chat, maybe they left the chat
                if (!member.canChat) continue;

                const to = member.user._id.toString();

                // Skip me
                if (to == from.id) continue; 

                const isUserConnected = await chatSocketService.isUserConnected(to);

                if (isUserConnected) {
                    this.to(to).emit('member left chat', {
                        chat: chat,
                        memberLeft: from.id,
                        genericMessage: genericMessage,
                        userLeft: userFrom
                    });
                } else {
                    // if (!member.options.muted) { 
                        offlineUsers.push(member);
                    // }
                }
            } 
            
            const obj = { chat: chat, offlineReceivers: offlineUsers, message: genericMessage, userLeft: userFrom };
            ack(obj.chat);

            return new Promise((resolve) => {
                resolve(obj)
            });
        }).then(result => { 
            // send the push notification to offline users
            if (result.offlineReceivers.length) {
                const pushNotification = new PushNotificationService();
                result.from = from;
                pushNotification.memberLeftChat(result);
            }
        }).catch((err) => { 
            console.error(`Error while leaving chat: ${err.message}`)
            ack({error: err.message});
        });
    } catch (ex) {
        console.error(`Generic Error while leaving chat: ${ex.message}`)
        ack(ex.message);
    } 
}

/**
 *
 * Make a chat favorite
 * @param {*} data
 * @param {*} ack
 */
const favoriteChat = async function(data, ack) {
    try {
        console.log(`Favorite Chat: ${JSON.stringify(data)}`)

        const chatService = new ChatServiceDB(ChatModel);
        const userId = this.user.id;
        const chatId = data.chatId;
        const favStatus = data.status;

        chatService.favoriteChat(userId, chatId, favStatus).then((result) => { 
            ack(result)
        }).catch((err) => { 
            ack({error: err.message});
        });
    } catch (ex) {
        ack(ex.message);
    } 
}

/**
 *
 * Block an active chat
 * @param {*} data
 * @param {*} ack
 */
const blockChat = async function(data, ack) {
    try {
        console.log(`Block Chat: ${JSON.stringify(data)}`)

        const chatService = new ChatServiceDB(ChatModel);
        const userId = this.user.id;
        const chatId = data.chatId;
        const blockStatus = data.status;
 
        const members = await chatService.getChatMembers(chatId, false)
        const opponent = members.filter( m => m.user != userId)[0];

        chatService.blockChat(opponent, chatId, blockStatus).then(async (result) => { 
            // ack(result)
            // Inform chat members about the block
            var offlineUsers = [];
            // const members = result.chat.members;
            // console.log(`Total members: ${members.length}`)
            const userService = new UserService(UserModel);
            const userFrom = await userService.getUserById(userId, true);
            const from = userFrom;
            // delete from.device;

            const promises = members.map(async member => {
                if (!member.canChat) return nil;

                const to = member.user._id.toString();

                // Skip me
                if (to == userFrom.id) return nil; 

                const isUserConnected = await chatSocketService.isUserConnected(to);
 
                if (isUserConnected) {
                    this.to(to).emit('member blocked chat', {
                        chat: result.chat,
                        blockedBy: from,
                        blockStatus: blockStatus
                    });
                } else {
                    // if (!member.options.muted) {
                        offlineUsers.push(member);
                    // }
                }

                return member;
            });
        
            // Wait for all to finish 
            await Promise.all(promises);

            const obj = {
                chat: result.chat,
                offlineReceivers: offlineUsers,
                text: blockStatus ? "Chat is blocked" : "Chat is unblocked",
                blockStatus: blockStatus,
                from: from
            };

            ack({
                chat: result.chat, 
                text: blockStatus ? "Chat is blocked" : "Chat is unblocked",
                blockStatus: blockStatus
            });

            return new Promise((resolve) => {
                resolve(obj)
            }); 
        }).then(result => { 
            // send the push notification to offline users
            //MARK: TODO: THis is wrong
            // Should be block chat not member left chat
            if (result.offlineReceivers.length) {
                const pushNotification = new PushNotificationService();
                // result.from = from;
                pushNotification.blockChat(result);
            }
        }).catch((err) => { 
            console.error(`Error while blocking/unblcoking chat user: ${err.message}`)
            ack({error: err.message});
        });
    } catch (ex) {
        console.error(`First degree Error while blocking/unblcoking chat user: ${ex.message}`)
        ack(ex.message);
    } 
}

/**
 *
 * Mute an active chat
 * @param {*} data
 * @param {*} ack
 */
const muteChat = async function(data, ack) {
    try {
        console.log(`Mute Chat: ${JSON.stringify(data)}`)

        const chatService = new ChatServiceDB(ChatModel);

        // this= is the current socket for the logged in user
        const userId = this.user.id;
        const chatId = data.chatId;
        const isMuted = data.status;

        chatService.muteChat(userId, chatId, isMuted).then((result) => { 
            ack(result)
        }).catch((err) => { 
            ack({error: err.message});
        });
    } catch (ex) {
        ack(ex.message);
    } 
}

/**
 *~Get all chats for user
 * Based on the needs it could be all chats or just favorite ones. If only favorites then a param 'onlyFavorites=true' is required
 *
 * @param {*} data
 * @param {*} ack
 */
const allChats = async function(data, ack) {
    try { 
        const userId = this.user.id
        console.log(`Get all chats: ${userId}`)
        const onlyFavorites = data.onlyFavorites || false;
        let skip = data.skip;
        if (skip == undefined) {
            skip = -1
        } 
        const chatService = new ChatServiceDB(ChatModel);
        
        chatService.getChatsForUser(userId, onlyFavorites, skip).then((chats) => {
            ack({ total: chats.length, chats: chats })
        }).catch(err => ack(err.message));
    } catch (ex) {
        console.error('Error getting chats: ' + ex.message);
        ack(ex.message);
    } 
} 

/**
 *When someone start typing in a chat
 *
 * @param {*} data
 * @param {*} ack
 */
const startTyping = async function(data, ack) {
    try {
        console.log(`Start typing at: ${Date()}`)
        const from = this.user.id;
        const chatId = data.chatId;
        const chatService = new ChatService(ChatModel);

        const chatMembers = await chatService.getChatMembers(chatId);
        const userService = new UserService(UserModel);
        
        const typier = await userService.getUserById(from, true);

        var receivers = [];

        for (const member of chatMembers) {
            if (member.toString() === from) continue;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('start typing', {
                    user: typier,
                    chatId: chatId
                });

                receivers.push(member.toString());
            }
        }

        ack({receivers: receivers});
    } catch (ex) {
        console.error(`General error start typing: ${ex.message}`)
        ack(ex.message);
    }
}

/**
 *WHen someone active typing, stops typing
 *
 * @param {*} data
 * @param {*} ack
 */
const stopTyping = async function(data, ack) {
    try {
        const from = this.user.id;
        const chatId = data.chatId;
        const chatService = new ChatService(ChatModel);

        const chatMembers = await chatService.getChatMembers(chatId);  

        var receivers = [];

        for (const member of chatMembers) {
            if (member.toString() === from) continue;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('stop typing', {
                    user: from,
                    chatId: chatId
                });

                receivers.push(member.toString());
            }
        }

        ack({receivers: receivers});
    } catch (ex) {
        console.error(`General error stop typing: ${ex.message}`)
        ack(ex.message);
    }
}

/** MESSAGES */

/**
 *
 *
 * @param {*} data
 * @param {*} ack
 */
const newMessage = async function(data, ack) {
    try {
        console.log(`New message:`)

        const from = this.user;
        // Create chat service
        const chatService = new ChatService(ChatModel);
        // ~Get chat members
        const chat = await chatService.getById(data.chatId, from.id);

        // Instantiate a message service
        const messageService = new MessageServiceDB(MessageModel);
        // // Remove the sender from the members
        const members = chat.members

        const json = data;
        json.sentOn = Date.now();
        json.members = members;
        json.from = from.id;

        // Create a temporary message 
        const tempMessage = await messageService.create(json); 
        // Save the message
        messageService.save(tempMessage)
        .then(async (result) => {

            // ack({ message: result.message });

            var deliveredTo = [];
            var offlineReceivers = [];
            // Set to chat this message
            //MARK: If not necessary, move these two lines at the end
            const chatServiceDB = new ChatServiceDB(ChatModel);
            const update = await chatServiceDB.setLatestMessage(data.chatId, tempMessage._id, from.id);
            const chat = update.chat; 

            ack({ message: result.message, chat: chat });

            // console.log(`Ack is sent: ${Date()}`)

            let object = {
                message: tempMessage,
                chat: chat,
                publicKey: data.publicKey,
                bytes: data.bytes
            }

            const promises = members.map(async member => {
                const canChat = member.canChat;
                if (!canChat) return member;

                const blocked = member.options.blocked;
                if (blocked) {
                    // update the message
                    await messageService.setMessageNotVisible(tempMessage._id)
                    return member;
                }

                const to = member.user._id.toString();
                if (to == from.id) return member; 

                const memberIsOnline = await chatSocketService.isUserConnected(to);

                if (memberIsOnline) {
                    // const unreadMessages = await chatService.countUnreadMessagesForChat(chat._id, to)
                    object.chat.unreadMessages += 1;
                    
                    // Send the message to online users
                    this.to(to).emit('new message received', object);

                    deliveredTo.push(to); 
                } else {
                    /// Offline people. Send a push notification
                    // console.log(`Offline member: ${member.user.device}`);
                    // if (!member.options.muted) {
                    offlineReceivers.push(member);
                    // }
                }

                return member;
            });

            await Promise.all(promises); 

            const obj = { message: result.message, chat: chat, offlineReceivers: offlineReceivers }; 

            if (offlineReceivers.length) {
                // Send the push notifications 
                // const userService = new UserService(UserModel); 
                // const fromUser = await userService.getUserById(from.id, true);
                obj.from = tempMessage.from;

                const pushNotification = new PushNotificationService();
                pushNotification.newMessage(obj);
            }

            if (deliveredTo.length) { 
                //Update the status of the message to delivered for users
                await messageService.messageDelivered(deliveredTo, result.message._id, Date.now());
                // Emit event that the message has been delivered to these people
                this.emit('message delivered to', { message: result.message, deliveredTo: deliveredTo });
            } 
        }).catch((err) => { 
            console.error(`Error: ${err.message}`)
            if (ack) { 
                ack({error: err.message});
            }
        });
    } catch (ex) {
        console.error(`Error: ${ex.message}`)
        ack(ex.message)
    }
};

/**
 *Get conversation for a single chat
 *
 * @param {*} data
 * @param {*} ack
 */
const messages = async function(data, ack) {
    try {
        const chatId = data.chatId;
        console.log(`Getting conversation: ${chatId}`); 
        const messageService = new MessageServiceDB(MessageModel);
        const toMessageDate = data.toMessageDate;
        const userId = this.user.id;
        let howMany = data.howMany;
        const isInitial = data.isInitial;
        const startValue = data.startValue;

        if (howMany == undefined) {
            howMany = -1
        } 

        /// ~Check the call from API
        const callback = async (inform, senders, chatId, userId) => {
            if (!inform) {  
                console.log("Senders are informed already");

                return;
            }

            console.log("Inform senders about conversaation read");
            let offlineReceivers = [];

            if (senders.length) {
                const promises = senders.map(async member => {
                    const socket = await chatSocketService.isUserConnected(member);

                    if (socket) {
                        this.to(member).emit('conversation read', { chatId: chatId, date: Date.now(), by: userId });
                    } else {
                        offlineReceivers.push(member)
                    }

                    return member;
                });

                const result = await Promise.all(promises);
                console.log(`Informed total: ${result.length} people`);

                if (offlineReceivers.length > 0) { 

                    console.log(`Offline receivers: ${offlineReceivers.length}`);
                    // send a Silent push 
                    const pushNotification = new PushNotificationService();
                    pushNotification.markConversationSeen({
                        chat: chatId,
                        by: userId,
                        date: Date.now(),
                        offlineReceivers: offlineReceivers,
                        title: 'Mark conversation seen'
                    }) 
                }
            }
        }

        messageService.getMessages(chatId, userId, toMessageDate, howMany, startValue, isInitial, callback)
        .then(async (result) => { 
            const messages = result.messages;
            ack({
                total: messages.length,
                messages: messages
            });  
            //TODO: Probably need to mark all the messages for the user as read.
        }).catch(err => { 
            console.error('Error first degree: ' + err.message);
            ack(err.message);
        });
    } catch (ex) {
        console.error('Error second degree: ' + ex.message);
        ack(ex.message)
    }
}

/**
 *
 * React on a message
 * @param {*} data
 * @param {*} ack
 * * TODO: Need  to finish the push notifiation
 */
const reactOnMessage = async function(data, ack) {
    try {
        console.log(`React on Message`)
        var offlineReceivers = [];
        const from = this.user;
        // Create chat service
        const chatService = new ChatService(ChatModel);
        // Instantiate a message service
        const messageService = new MessageServiceDB(MessageModel);
        const userService = new UserService(UserModel);
        //Save the reaction
        messageService.reactOnMessage(data.messageId, data.reaction, from.id, data.date).then(async (result) => { 
            const message = result.message;
            const userFrom = await userService.getUserById(from.id, true);
        // ~Get chat members
            const chat = await chatService.getChatById(message.chatId);
            const members = chat.members;

            for (const member of members) {
                const canChat = member.canChat; 
                if (!canChat) continue;

                const to = member.user._id.toString();
                if (to == from.id) continue;
                 
                const memberIsOnline = await chatSocketService.isUserConnected(to); 
                if (memberIsOnline) {
                    // Send the message to online users
                    this.to(to).emit('message reaction', {
                        message: { 
                            id: message._id
                        },
                        reaction: result.reaction,
                        userFrom: userFrom
                    }); 
                } else {
                    /// Offline people. Send a push notification
                    // if (!member.options.muted) {
                    offlineReceivers.push(member);
                    // }
                }
            }
            const obj = {message: message._doc, chat: chat, reaction: result.reaction, offlineReceivers: offlineReceivers, title: 'Message reaction is stored', from: userFrom};
            ack(obj);

            return new Promise((resolve) => {
                resolve(obj)
            }); 
            // console.log("Label: " + result.title);
        }).then(result => {
            if (result.offlineReceivers.length) {
                // Send the push notifications 
                // result.from = fromUser;

                const pushNotification = new PushNotificationService();
                pushNotification.reactOnMessage(result);
            } else {
                console.log(`No offline users`)
            }
        }).catch((err) => {
            console.error(`Error on message react: ${err}`)
            ack(err);
        }) 
    } catch (ex) {
        console.err(`General error on message react: ${err}`)
        ack(ex);
    }
}

/**
 *
 * Delete a message
 * Message can be marked deleted for a single user or 'MySelf' or for Everyone ( only a message sent from the same user )
 * @param {*} data
 * @param {*} ack
 * TODO: Need  to finish the push notifiation
 */
const deleteMessage = async function(data, ack) {
    try { 
        console.log(`Delete message: ${data.messageId}`)
        var offlineReceivers = [];
        // Instantiate a message service
        const from = this.user;
        const messageService = new MessageServiceDB(MessageModel);  

        messageService.deleteMessage(data.messageId, from.id, data.forEveryone).then(async (result) => { 
            const message = result.message;
            // MARK: Update the last message
            const chatService = new ChatServiceDB(ChatModel);
            const res = await chatService.updateChatWithLastMessage(message.chatId);
            const chat = res.chat;

            chat.unreadMessages = 0;
            const userService = new UserService(UserModel);

            let sender;
            if (data.forEveryone) {
                sender = await userService.getUserById(from.id, true); 

                const members = chat.members

                for (const member of members) {
                    const canChat = member.canChat;
                    if (!canChat) continue;

                    const to = member.user._id.toString();
                    if (to == from.id) continue;

                    const memberIsOnline = await chatSocketService.isUserConnected(to);
                    if (memberIsOnline) {
                        // Send the message to online users
                        this.to(to).emit('message deleted', {
                            message: {
                                id: message._id,
                                forEveryone: true,
                                dateDeleted: message.deleted.date,
                                from: sender,
                                chat: chat
                            }
                        });
                    } else {
                        /// Offline people. Send a push notification
                        // if (!member.options.muted) {
                            offlineReceivers.push(member);
                            await userService.setContentStorageFor(member.user, from, 'delete', {message: message})
                        // }
                    }
                }
            }

            let obj = { message: message, chat: chat, offlineReceivers: offlineReceivers, deleted: true, title: 'Message marked as deleted' };
            ack(obj); 

            return new Promise((resolve) => {
                // const modified = obj;
                if (sender) { 
                    obj.from = sender;
                } else {
                    obj.from = from;
                }
                
                resolve(obj)
            });
            //MARK: Check theu sers and send a push if not muted
        }).then(result => {
            if (result.offlineReceivers.length) {
                
                const pushNotification = new PushNotificationService(); 
                pushNotification.messageDeleted(result);
            } else {
                console.log(`No offline users`)
            }
        }).catch((err) => {
            console.error(`Error while deleting message: ${err.message}`)
            ack({ error: err.message, deleted: false });
        }) 
    } catch (ex) {
        console.error(`Error deleting message: ${ex.message}`)
        ack({ error: ex.message, deleted: false });
    } 
}

/**
 * Mark a message seen from receivers
 *
 * @param {*} data
 * @param {*} ack
 */
const messageSeen = async function(data, ack) {
    try {
        console.log(`Marking Message seen/read`)
        const offlineReceivers = [];
        // Instantiate a message service
        const messageService = new MessageServiceDB(MessageModel); 
        const from = this.user.id;
        const messageId = data.messageId;
        const messageDate = data.date;

        messageService.messageSeen(from, messageId, messageDate).then( async (message) => {  
            const creator = message.from.toString();
            // Get the creator of the message
            const memberIsOnline = await chatSocketService.isUserConnected(creator);

            if (memberIsOnline) {
                // Send the message to online users
                this.to(creator).emit('message seen by', {
                    messageId: messageId,
                    by: from,
                    date: messageDate
                });
            } else {
                /// Offline people. Send a push notification
                offlineReceivers.push(creator);
            }
 
            ack({
                messageId: messageId,
                to: creator,
                title: 'Message seen ack sent'
            });

            if (offlineReceivers.length > 0) {

                const pushNotification = new PushNotificationService();
                pushNotification.markMessageSeen({
                    messageId: messageId,
                    by: from,
                    date: messageDate,
                    offlineReceivers: offlineReceivers,
                    title: 'Mark message seen'
                })
            }
        }).catch((err) => {
            ack(err.message);
        }) 
    } catch (ex) {
        console.error(`Error on message seen: ${ex.message}`)
        ack(ex.message);
    };
};

/**
 * Mark a chat message as delivered/received by/to receivers
 *
 * @param {*} data
 * @param {*} ack
 */
const messageDelivered = async function(data, ack) {
    try { 
        console.log(`Marking Message Delivered`)
        var offlineReceivers = [];
        // Instantiate a message service
        const messageService = new MessageServiceDB(MessageModel); 
        const from = data.from;
        const messageId = data.messageId;
        const messageDate = data.date;

        messageService.messageDelivered(from, messageId, messageDate).then( async (message) => {  
            const creator = message.from.toString();
            // Get the creator of the message
            const memberIsOnline = await chatSocketService.isUserConnected(creator);

            if (memberIsOnline) {
                // Send the message to online users
                this.to(creator).emit('message received by', {
                    messageId: messageId,
                    by: from
                });
            } else {
                /// Offline people. Send a push notification
                offlineReceivers.push(creator);
            }

            ack({
                messageId: messageId,
                to: creator,
                title: 'Message delivered ack sent'
            });

            if (offlineReceivers.length > 0) { 
                const pushNotification = new PushNotificationService();
                pushNotification.markMessageReceived({
                    messageId: messageId,
                    by: from,
                    date: messageDate,
                    offlineReceivers: offlineReceivers,
                    title: 'Mark message delivered'
                })
            }
        }).catch((err) => {
            ack(err.message);
        });
    } catch (ex) {
        console.error(`Error on message delivered: ${ex.message}`)
        ack(ex.message);
    };
}; 

/**
 * 
 *
 * @param {*} data
 * @param {*} ack
 */
const markConversationSeen = async function(data, ack) {
    try {
        console.log(`Marking conversation seen/read`)
        var offlineReceivers = [];
        // Instantiate a message service
        const messageService = new MessageServiceDB(MessageModel); 
        const from = this.user.id;
        const chatId = data.chatId;
        const date = data.date;
        const senders = data.senders;

        const result = await messageService.markConversationSeen(from, chatId, date)
    
        ack({
            chatId: chatId,
            result: result
        });

        // if (result.total == 0) {
        //     return;
        // }

        // Get the creator of the message
        // for (const member of senders) {
        //     const memberIsOnline = await ChatSocketService.isUserConnected(member);

        //     if (memberIsOnline) {
        //         // Send the message to online users
        //         this.to(member).emit('conversation read', {
        //             chatId: chatId,
        //             by: from, 
        //             date: date
        //         });
        //     } else {
        //         /// Offline people. Send a push notification
        //         offlineReceivers.push(member);
        //     }
        // }

        // console.log('From: ' + from);
        const promises = senders.map(async member => {
            // console.log('To Sender: ' + member);
            const socket = await chatSocketService.isUserConnected(member);

            if (socket) {
                this.to(member).emit('conversation read', { chatId: chatId, date: date, by: from });
            } else {
                offlineReceivers.push(member)
            }

            return member;
        });

        await Promise.all(promises); 
         
        if (offlineReceivers.length) {
            // send a Silent push
            const pushNotification = new PushNotificationService();
            pushNotification.markConversationSeen({
                chat: chatId, 
                by: from, 
                date: date,
                offlineReceivers: offlineReceivers, 
                title: 'Mark conversation seen'
            })
        }
    } catch (ex) {
        console.error(`Error on conversation seen: ${ex.message}`)
        ack(ex.message);
    };
};

/**
 *
 *
 * @param {*} data
 * @param {*} ack
 */
const totalUnreadChats = async function(ack) {
    try {
        console.log(`Get total unread chats for user`)

        const from = this.user.id;
        // Create chat service
        const chatService = new ChatService(ChatModel);
        // ~Get chat members
        const total = await chatService.countTotalUnreadChatsForUser(from);

        ack({ totalUnread: total });
    } catch (ex) {
        console.error(`General Error while getting total unread chats for user: ${ex.message}`)
        ack(ex);
    }
}

/**
 *
 *
 * @param {*} data
 * @param {*} ack
 */
const exchangeInfo = async function(data, ack) {
    try { 
        const from = this.user.id;
        const chatId = data.chatId;
        const chatService = new ChatService(ChatModel);

        const chatMembers = await chatService.getChatMembers(chatId);
        let receivers = [];
        const promises = chatMembers.map(async member => {
            if (member.toString() === from) return null;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('exchange info', data);

                receivers.push(member.toString());
            }

            return member
        });

        await Promise.all(promises);  

        // ACK back to the sender
        ack({receivers: receivers});
        // Store the public key to chat
        try { 
            await chatService.updateChatWithPublicKey(data);
            console.info('Chat was updated with public key');
        } catch (ex) {
            console.err('Chat was not updated with public key: ' + ex.message);
        }
    } catch (ex) {
        console.error(`General error start typing: ${ex.message}`)
        ack(ex.message);
    }
}