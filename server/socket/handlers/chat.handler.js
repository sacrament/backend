const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { UserService, ChatService, MessageService } = require('../../services');
const { getChatService } = require('../services');
const pushNotificationService = require('../../notifications');
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
            'clear chat': clearChat,
            'edit message': editMessage
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
                pushNotificationService.blockChat(result);
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
 * Handle new message creation and distribution
 * - Validates sender permissions and message content
 * - Creates and saves message with E2EE support
 * - Delivers to online/offline recipients asynchronously
 * - Tracks delivery status (delivered/read)
 * - Sends push notifications to offline users
 * - Implements idempotency checks and retry logic
 */
const newMessage = async function(data, ack) {
    let tempMessage = null;
    let result = null;
    const startTime = Date.now();

    try {
        // Validate input parameters
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid message data');
        }

        const { chatId, tempId, content, kind } = data;
        
        if (!chatId || !content) {
            throw new Error('chatId and content are required');
        }

        // Validate message type
        const validKinds = ['text', 'image', 'video', 'audio', 'document', 'GIF', 'generic', 'share contact'];
        if (kind && !validKinds.includes(kind)) {
            throw new Error(`Invalid message kind: ${kind}`);
        }

        logger.debug(`New message: ${chatId}`);

        const from = this.user;
        
        // Validate sender
        if (!from || !from.id) {
            throw new Error('Sender identification failed');
        }

        // Check for duplicate message (idempotency)
        if (tempId) {
            const isDuplicate = await messageService.isDuplicate(tempId, chatId);
            if (isDuplicate) {
                logger.warn(`Duplicate message detected: tempId=${tempId}`);
                return ack({ warning: 'Duplicate message', isDuplicate: true });
            }
        }

        // Get chat and verify sender is member with permissions
        let chat;
        try {
            chat = await chatService.getById(chatId, from.id);
        } catch (err) {
            throw new Error(`Unable to verify chat membership: ${err.message}`);
        }

        if (!chat) {
            throw new Error('Chat not found or access denied');
        }

        const members = chat.members;
        const senderMember = members.find(m => m.user._id.toString() === from.id);
        
        if (!senderMember || !senderMember.canChat) {
            throw new Error('Sender is not authorized to send messages in this chat');
        }

        // Validate minimal members for sending
        if (members.filter(m => m.canChat).length < 2) {
            throw new Error('At least 2 members needed to send messages');
        }

        // Prepare message data
        const messageData = {
            ...data,
            sentOn: Date.now(),
            sentOnTimestamp: Math.floor(Date.now() / 1000), // For backwards compatibility
            members: members,
            from: from.id,
            tempId: tempId || new mongoose.Types.ObjectId().toString()
        };

        // Create message object (in-memory)
        tempMessage = await messageService.create(messageData);
        
        // Save message to database
        result = await messageService.save(tempMessage);
        
        if (!result || !result.message) {
            throw new Error('Failed to persist message');
        }

        logger.info(`Message saved: ${result.message._id} in ${Date.now() - startTime}ms`);

        // Update chat's last message reference
        let updatedChat;
        try {
            const update = await chatService.setLatestMessage(chatId, tempMessage._id, from.id);
            updatedChat = update.chat;
        } catch (err) {
            logger.error(`Failed to update last message: ${err.message}`);
            updatedChat = chat; // Use original chat if update fails
        }

        // Send ACK immediately with persisted message
        ack({ 
            message: result.message, 
            chat: updatedChat,
            tempId: messageData.tempId 
        });

        // === ASYNC DELIVERY HANDLING (non-blocking) ===
        // Schedule delivery without blocking the ACK
        setImmediate(async () => {
            try {
                const distributeStart = Date.now();
                const stats = await distributeMessage(
                    this,
                    tempMessage,
                    result.message,
                    updatedChat,
                    members,
                    from,
                    data
                );
                
                logger.info(
                    `Message delivery completed: ` +
                    `online=${stats.online}, offline=${stats.offline}, ` +
                    `blocked=${stats.blocked}, duration=${Date.now() - distributeStart}ms`
                );
            } catch (err) {
                logger.error(`Error distributing message ${tempMessage._id}: ${err.message}`);
            }
        });

    } catch (error) {
        logger.error(`Error in newMessage handler: ${error.message}`, { 
            chatId: data?.chatId,
            userId: this.user?.id,
            duration: Date.now() - startTime 
        });
        
        if (ack) {
            ack({ 
                error: error.message,
                code: error.code || 'MESSAGE_ERROR'
            });
        }
    }
};

/**
 * Edit a text message's content.
 * Only the original sender can edit, and only text messages.
 */
const editMessage = async function(data, ack) {
    try {
        const from = this.user;
        const { messageId, content: newContent } = data;

        if (!messageId || !newContent) {
            return ack({ error: 'messageId and content are required' });
        }

        const result = await messageService.editMessage(messageId, from.id, newContent);
        const message = result.message;

        const chat = await chatService.getChatById(message.chatId.toString());
        const members = chat.members;
        const offlineReceivers = [];

        ack({ message, title: result.title });

        for (const member of members) {
            if (!member.canChat) continue;

            const to = member.user._id.toString();
            if (to === from.id) continue;

            const isOnline = await chatSocketService.isUserConnected(to);
            if (isOnline) {
                this.to(to).emit('message edited', {
                    messageId: message._id,
                    content: newContent,
                    editedOn: message.editedOn,
                    chatId: message.chatId,
                });
            } else if (!member.options?.muted) {
                offlineReceivers.push(member);
            }
        }

        if (offlineReceivers.length > 0) {
            const senderUser = await userService.getUserById(from.id);
            pushNotificationService.editMessage({
                message,
                chat,
                offlineReceivers,
                from: senderUser,
            });
        }
    } catch (ex) {
        logger.error(`Error editing message: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Helper: Distribute message to all recipients
 * Handles online delivery via socket and offline via push notifications
 * Returns delivery statistics for logging and monitoring
 */
async function distributeMessage(socket, tempMessage, savedMessage, updatedChat, members, sender, originalData) {
    const deliveredTo = [];
    const offlineReceivers = [];
    const blockedReceivers = [];

    // Filter valid recipients and deliver in parallel where possible
    const deliveryPromises = members
        .filter(member => member.canChat && member.user._id.toString() !== sender.id)
        .map(async (member) => {
            const recipientId = member.user._id.toString();
            
            try {
                // Check if message is blocked for recipient
                if (member.options?.blocked) {
                    logger.debug(`Message blocked for user ${recipientId}`);
                    blockedReceivers.push(recipientId);
                    
                    // Mark message as invisible for this user (non-blocking)
                    messageService.setMessageNotVisible(tempMessage._id)
                        .catch(err => logger.warn(`Failed to mark invisible: ${err.message}`));
                    
                    return;
                } 

                // Check if recipient is online
                const isOnline = await chatSocketService.isUserConnected(recipientId);

                if (isOnline) {
                    try {
                        // Emit to online recipient
                        socket.to(recipientId).emit('new message received', {
                            message: tempMessage,
                            chat: updatedChat,
                            publicKey: originalData.publicKey,
                            bytes: originalData.bytes,
                            sentAt: Date.now()
                        });
                        
                        deliveredTo.push(recipientId);
                        logger.debug(`Message delivered (online) to: ${recipientId}`);
                    } catch (err) {
                        logger.error(`Failed to emit message to ${recipientId}: ${err.message}`);
                    }
                } else {
                    // Track for push notification
                    offlineReceivers.push(member);
                    logger.debug(`User offline: ${recipientId}, queued for push`);
                }
            } catch (err) {
                logger.error(`Error processing recipient ${member.user._id}: ${err.message}`);
            }
        });

    // Wait for all delivery attempts
    await Promise.allSettled(deliveryPromises);

    // Update delivery status for online users (batch operation)
    if (deliveredTo.length > 0) {
        try {
            await messageService.messageDelivered(deliveredTo, savedMessage._id.toString(), Date.now());
            logger.info(`Delivery confirmed for ${deliveredTo.length} recipients`);
            
            // Notify sender of delivery confirmation
            socket.emit('message delivered to', {
                messageId: savedMessage._id,
                deliveredTo: deliveredTo,
                timestamp: Date.now()
            });
        } catch (err) {
            logger.error(`Failed to update delivery status: ${err.message}`);
        }
    }

    // Send push notifications to offline users (batch operation)
    if (offlineReceivers.length > 0) {
        try { 
            
            // Filter offline users who haven't muted notifications
            const notifiableReceivers = offlineReceivers.filter(
                m => !m.options?.muted
            );

            if (notifiableReceivers.length > 0) {
                const senderUser = await userService.getUserById(sender.id);
                if (!senderUser) {
                    logger.warn(`push:newMessage — sender ${sender.id} not found, skipping push`);
                } else {
                    pushNotificationService.newMessage({
                        message: savedMessage,
                        chat: updatedChat,
                        offlineReceivers: notifiableReceivers,
                        from: senderUser,
                        timestamp: Date.now()
                    });
                }

                logger.info(`Push notifications queued for ${notifiableReceivers.length} users`);
            }
        } catch (err) {
            logger.error(`Error queueing push notifications: ${err.message}`);
        }
    }

    // Return statistics for monitoring
    return {
        online: deliveredTo.length,
        offline: offlineReceivers.length,
        blocked: blockedReceivers.length,
        totalRecipients: members.filter(m => m.canChat && m.user._id.toString() !== sender.id).length
    };
}

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
                    pushNotificationService.markConversationSeen({
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
                pushNotificationService.reactOnMessage(result);
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
                
                pushNotificationService.messageDeleted(result);
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
                pushNotificationService.markMessageSeen({
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
                pushNotificationService.markMessageReceived({
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
    var offlineReceivers = [];
    try {
        const from = this.user.id;
        
        // Handle different possible data structures
        // Sometimes data might be null/undefined if no arguments sent
        let chatId, date, senders;
        
        if (!data) {
            console.warn(`[Mark Conversation Seen] No data object received`);
            data = {};
        } else if (typeof data === 'string') {
            // If data was passed as string, it's likely the chatId
            console.warn(`[Mark Conversation Seen] Data received as string, assuming it's chatId`);
            chatId = data;
        } else if (typeof data === 'object') {
            // Normal case: data object with properties
            chatId = data.chatId;
            date = data.date;
            senders = data.senders;
        } 
        
        if (!chatId) {
            const errorMsg = 'Chat ID is required in request data';
            console.error(`[Mark Conversation Seen Error] ${errorMsg} - Received data:`, {
                data,
                from
            });
            throw new Error(errorMsg);
        }

        if (!from) {
            throw new Error('User ID is missing from socket context');
        }

        if (!date) {
            throw new Error('Date is required');
        }

        if (!senders || !Array.isArray(senders) || senders.length === 0) {
            console.warn(`[Mark Conversation Seen] Warning: senders is empty or not an array:`, senders);
        }

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
        const promises = (senders || []).map(async member => {
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
            pushNotificationService.markConversationSeen({
                chat: chatId, 
                by: from, 
                date: date,
                offlineReceivers: offlineReceivers, 
                title: 'Mark conversation seen'
            })
        }
    } catch (ex) {
        console.error(`[Error] Conversation seen failed:`, {
            message: ex.message,
            stack: ex.stack.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
            data: {
                dataType: typeof data,
                dataKeys: Object.keys(data || {}),
                chatId: data?.chatId,
                date: data?.date,
                sendersCount: data?.senders?.length,
                userId: this.user?.id,
                offlineReceivers
            }
        });
        if (ack && typeof ack === 'function') {
            ack({ error: ex.message });
        }
    }
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
    const callback = typeof ack === 'function'
        ? ack
        : (typeof data === 'function' ? data : null);

    const payload = (data && typeof data === 'object' && !Array.isArray(data))
        ? data
        : {};

    try {
        const from = this.user.id;
        const chatId = payload.chatId?.toString();

        if (!chatId) {
            if (callback) callback({ error: 'chatId is required' });
            return;
        }

        const chatMembers = await chatService.getChatMembers(chatId);
        let receivers = [];
        const promises = chatMembers.map(async member => {
            if (member.toString() === from) return null;

            const memberIsOnline = await chatSocketService.isUserConnected(member.toString());

            if (memberIsOnline) {
                // Send the message to online users 
                this.to(member.toString()).emit('exchange info received', payload);

                receivers.push(member.toString());
            }

            return member
        });

        await Promise.all(promises);  

        // ACK back to the sender
        if (callback) callback({receivers: receivers});
        // Store the public key to chat
        try {
            await chatService.updateChatWithPublicKey(payload);
            console.info('Chat was updated with public key');
        } catch (ex) {
            console.error('Chat was not updated with public key: ' + ex.message);
        }
    } catch (ex) {
        console.error(`General error exchange info: ${ex.message}`)
        if (callback) callback({ error: ex.message });
    }
}