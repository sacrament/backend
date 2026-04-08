const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { UserService, ChatService, MessageService } = require('../../services');
const { getChatService } = require('../services');
const PushNotificationService = require('../../notifications');
const e2eeService = require('../../services/domain/e2ee/e2ee.service');
const chatService = new ChatService();
// Instantiate a message service
const messageService = new MessageService();
const userService = new UserService();

// Declared at module level so standalone handler functions can access it.
// Assigned in the constructor, which runs after socketServicesManager is initialized.
let chatSocketService;

module.exports = class Chat {
    constructor() {
        chatSocketService = getChatService();
        this.handler = {
            // ── Legacy event names (kept for backwards compatibility) ──────────
            'new chat': newChat,
            'new message': newMessage,
            'react on message': reactOnMessage,
            'delete message': deleteMessage,
            'delete chat': deleteChat,
            'favorite chat': favoriteChat,
            'block chat': blockChat,
            'mute chat': muteChat,
            'message seen': messageSeen,
            'message received': messageDelivered,
            'chat messages': messages,
            'all chats': allChats,
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

        const from = this.user.id;
        data.userId = from;

        // Register E2EE device if client sent key material with chat creation
        // if (data.device) {
        //     const { registrationId, identityKey, signedPreKey, oneTimePreKeys } = data.device;
        //     await e2eeService.registerDevice(from, { registrationId, identityKey, signedPreKey, oneTimePreKeys });
        // }

        chatService.create(data).then(async (result) => {
            ack(result);

            // Broadcast new chat to all other members
            if (result.chat && result.chat.members) {
                const members = result.chat.members.filter(member => {
                    const memberId = member.user ? member.user._id.toString() : member._id.toString();
                    return memberId !== from;
                });

                for (const member of members) {
                    const to = member.user ? member.user._id.toString() : member._id.toString();
                    const memberIsOnline = await chatSocketService.isUserConnected(to);
                    if (memberIsOnline) {
                        this.to(to).emit('new chat created', { chat: result.chat });
                    }
                }
            }
        }).catch((err) => {
            ack({error: err.message});
        })
    } catch (ex) {
        ack(ex.message);
    } 
};
 
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
 
        chatService.deleteChat(data.chatId, from.id).then(async (result) => {
            // Delete is per-user only — only ack the deleting user, do not notify others
            ack({ chat: result.chat });
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

/**
 *
 * Make a chat favorite
 * @param {*} data
 * @param {*} ack
 */
const favoriteChat = async function(data, ack) {
    try {
        console.log(`Favorite Chat: ${JSON.stringify(data)}`) 
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
            const userService = new UserService();
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

        const userId = this.user.id;
        const chatId = data.chatId;
        const isMuted = data.status;

        chatService.muteChat(userId, chatId, isMuted).then(async (result) => {
            // Since every chat is private (1-to-1), muting the chat also mutes the user.
            // Keep MutedUser in sync so notification filtering works correctly.
            try {
                const members = await chatService.getChatMembers(chatId, false);
                const opponent = members.find(m => m.user.toString() !== userId);
                if (opponent) {
                    const MutedUser = mongoose.model('MutedUser');
                    const opponentId = opponent.user.toString();
                    if (isMuted) {
                        await MutedUser.findOneAndUpdate(
                            { muter: userId, muted: opponentId },
                            { muter: userId, muted: opponentId },
                            { upsert: true }
                        );
                    } else {
                        await MutedUser.findOneAndDelete({ muter: userId, muted: opponentId });
                    }
                }
            } catch (syncErr) {
                console.error(`muteChat: failed to sync MutedUser: ${syncErr.message}`);
            }
            ack(result);
        }).catch((err) => {
            ack({ error: err.message });
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
        const chatId = data.chatId?.toString();

        const chatMembers = await chatService.getChatMembers(chatId); 
        
        const typier = await userService.getUserById(from, true);

        var receivers = [];

        for (const member of chatMembers) {
            if (member.toString() === from) continue;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('start typing', {
                    chatId: chatId,
                    user: typier
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
        const chatId = data.chatId?.toString();

        const chatMembers = await chatService.getChatMembers(chatId);  

        var receivers = [];

        for (const member of chatMembers) {
            if (member.toString() === from) continue;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('stop typing', {
                    chatId: chatId,
                    user: from
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
        console.log(`New message: ${data.chatId}`);

        const from = this.user;
        
        // Validate sender and get chat with validations
        if (!from || !from.id) {
            throw new Error('Sender identification failed');
        }

        // Get chat and verify sender is member
        const chat = await chatService.getById(data.chatId, from.id);
        const members = chat.members;

        // Validate sender is in members list
        const senderMember = members.find(m => m.user._id.toString() === from.id);
        if (!senderMember || !senderMember.canChat) {
            throw new Error('Sender is not authorized to send messages in this chat');
        }

        const json = data;
        json.sentOn = Date.now();
        json.members = members;
        json.from = from.id;
        json.tempId = json.tempId || new mongoose.Types.ObjectId().toString();

        // Create a temporary message
        const tempMessage = await messageService.create(json);
        
        // Save the message to database
        messageService.save(tempMessage)
            .then(async (result) => {
                const deliveredTo = [];
                const offlineReceivers = [];
                
                // Update chat's last message
                const update = await chatService.setLatestMessage(data.chatId, tempMessage._id, from.id);
                const updatedChat = update.chat;

                // Send ACK immediately
                ack({ message: result.message, chat: updatedChat });

                // Build broadcast object (will be cloned for each recipient)
                const baseObject = {
                    message: tempMessage,
                    chat: updatedChat,
                    publicKey: data.publicKey,
                    bytes: data.bytes
                };

                // Process each member in sequence to handle blocked status and delivery tracking
                for (const member of members) {
                    try {
                        // Skip if member cannot chat
                        if (!member.canChat) {
                            console.log(`Skipping member ${member.user._id}: cannot chat`);
                            continue;
                        }

                        const to = member.user._id.toString();
                        
                        // Skip sender
                        if (to === from.id) {
                            console.log(`Skipping sender: ${to}`);
                            continue;
                        }

                        // Check if message is blocked for this user
                        if (member.options && member.options.blocked) {
                            console.log(`Message blocked for user ${to}`);
                            try {
                                await messageService.setMessageNotVisible(tempMessage._id);
                            } catch (err) {
                                console.error(`Error marking message invisible: ${err.message}`);
                            }
                            continue;
                        }

                        // Check if receiver exists and is connected
                        const memberIsOnline = await chatSocketService.isUserConnected(to);

                        if (memberIsOnline) {
                            // Create a fresh clone of the message object for this recipient
                            // This prevents shared state issues with unreadMessages counter
                            const recipientObject = JSON.parse(JSON.stringify(baseObject));
                            
                            // Emit to online user
                            this.to(to).emit('new message received', recipientObject);
                            
                            deliveredTo.push(to);
                            console.log(`Message delivered online to: ${to}`);
                        } else {
                            // Track offline receiver for push notification
                            offlineReceivers.push(member);
                            console.log(`User offline: ${to}, will send push notification`);
                        }
                    } catch (memberError) {
                        console.error(`Error processing member delivery: ${memberError.message}`);
                        // Continue processing other members
                    }
                }

                // Send push notifications to offline users
                if (offlineReceivers.length > 0) {
                    try {
                        const pushNotificationObj = {
                            message: result.message,
                            chat: updatedChat,
                            offlineReceivers: offlineReceivers,
                            from: tempMessage.from
                        };
                        
                        const pushNotification = new PushNotificationService();
                        pushNotification.newMessage(pushNotificationObj);
                        console.log(`Push notifications queued for ${offlineReceivers.length} users`);
                    } catch (pushError) {
                        console.error(`Error sending push notifications: ${pushError.message}`);
                    }
                }

                // Update message delivery status for online users
                if (deliveredTo.length > 0) {
                    try {
                        await messageService.messageDelivered(deliveredTo, result.message._id.toString(), Date.now());
                        console.log(`Delivery confirmed for ${deliveredTo.length} users`);
                        
                        // Emit delivery confirmation event
                        this.emit('message delivered to', {
                            message: result.message,
                            deliveredTo: deliveredTo
                        });
                    } catch (deliveryError) {
                        console.error(`Error updating delivery status: ${deliveryError.message}`);
                    }
                }
            }).catch((err) => {
                console.error(`Error saving message: ${err.message}`);
                if (ack) {
                    ack({ error: err.message });
                }
            });
    } catch (ex) {
        console.error(`Error in newMessage handler: ${ex.message}`);
        if (ack) {
            ack({ error: ex.message });
        }
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
                        reaction: {
                            message: { id: message._id },
                            kind: result.reaction
                        }
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
        const from = this.user;

        messageService.deleteMessage(data.messageId, from.id, data.forEveryone).then(async (result) => {
            const message = result.message; 
            const res = await chatService.updateChatWithLastMessage(message.chatId);
            const chat = res.chat;

            chat.unreadMessages = 0; 

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
                            id: message._id,
                            forEveryone: true,
                            dateDeleted: message.deleted?.date,
                            chat: { id: chat._id }
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
const totalUnreadChats = async function(data, ack) {
    try {
        console.log(`Get total unread chats for user`)

        const from = this.user.id;
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
        const chatId = data.chatId?.toString();

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
        console.error(`General error exchange info: ${ex.message}`)
        ack(ex.message);
    }
}