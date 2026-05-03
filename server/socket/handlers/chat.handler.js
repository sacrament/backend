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
            'message reactions': messageReactions,
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
        const fromUser = this.user;
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
                    } else {
                        pushNotificationService.newChatCreated({
                            chat: result.chat,
                            from: fromUser,
                            offlineReceivers: [member]
                        });
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
    let resolvedChatId = null;
    const startTime = Date.now();

    try {
        // Validate input parameters
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid message data');
        }

        const chatPayload = data.chat;
        const resolvedInputChatId = (data.chatId || chatPayload?._id || chatPayload?.id)?.toString();

        // Flat payload contract from iOS.
        const content = data.content;
        const mediaUrl = data.mediaUrl;
        const mediaName = data.mediaName;
        const thumbnail = data.thumbnail;
        const type = data.type ?? data.kind;
        const tempId = data.tempId;
        const replyTo = data.replyTo;
        const encrypted = data.encrypted;
        const e2ee = data.e2ee;
        const publicKey = data.publicKey;
        const bytes = data.bytes;

        if (!resolvedInputChatId && (!chatPayload || typeof chatPayload !== 'object' || Array.isArray(chatPayload))) {
            throw new Error('chatId or chat is required');
        }

        if (!content && !mediaUrl) {
            throw new Error('content is required');
        }

        // Validate message type
        const validKinds = ['text', 'image', 'video', 'audio', 'document', 'share contact'];
        const resolvedType = type || (mediaUrl ? 'image' : 'text');
        if (!validKinds.includes(resolvedType)) {
            throw new Error(`Invalid message kind: ${resolvedType}`);
        }

        logger.debug(`New message: ${resolvedInputChatId || 'inline-chat-resolution'}`);

        const from = this.user;
        
        // Validate sender
        if (!from || !from.id) {
            throw new Error('Sender identification failed');
        }

        // Resolve chat: use chatId if provided, otherwise find-or-create from chat payload.
        let chat;
        if (resolvedInputChatId) {
            resolvedChatId = resolvedInputChatId;
            try {
                chat = await chatService.getById(resolvedInputChatId, from.id);
            } catch (err) {
                throw new Error(`Unable to verify chat membership: ${err.message}`);
            }
        } else {
            const payloadUsers = Array.isArray(chatPayload?.users) ? chatPayload.users : [];
            if (payloadUsers.length === 0) {
                throw new Error('chat.users is required when chatId is not provided');
            }

            const uniqueUsers = [...new Set([from.id, ...payloadUsers.map(userId => userId?.toString())])];
            if (uniqueUsers.length !== 2) {
                throw new Error('chat.users must define exactly one other participant for 1:1 chat');
            }

            try {
                const createdChatResult = await chatService.create({
                    userId: from.id,
                    chat: {
                        users: uniqueUsers
                    }
                });

                chat = createdChatResult.chat;
                resolvedChatId = chat?._id?.toString();
            } catch (err) {
                // In a creation race, uniqueId can conflict. Retry via create() to load existing chat.
                if (err?.code === 11000 || /duplicate key/i.test(err?.message || '')) {
                    const retryChatResult = await chatService.create({
                        userId: from.id,
                        chat: {
                            users: uniqueUsers
                        }
                    });
                    chat = retryChatResult.chat;
                    resolvedChatId = chat?._id?.toString();
                } else {
                    throw new Error(`Unable to resolve chat from payload: ${err.message}`);
                }
            }
        }

        if (!chat) {
            throw new Error('Chat not found or access denied');
        }

        if (!resolvedChatId) {
            resolvedChatId = chat._id.toString();
        }

        // Check for duplicate message (idempotency) after chat resolution
        if (tempId) {
            const isDuplicate = await messageService.isDuplicate(tempId, resolvedChatId);
            if (isDuplicate) {
                logger.warn(`Duplicate message detected: tempId=${tempId}`);
                return ack({ warning: 'Duplicate message', isDuplicate: true, chat });
            }
        }

        let members = chat.members;
        const senderMember = members.find(m => m.user._id.toString() === from.id);
        
        if (!senderMember || !senderMember.canChat) {
            throw new Error('Sender is not authorized to send messages in this chat');
        }

        // If receiver had previously deleted/left this private chat (canChat=false + leftOn set), re-enable them.
        const receiverMember = members.find(m => m.user._id.toString() !== from.id);
        if (receiverMember && !receiverMember.canChat && receiverMember.leftOn) {
            const receiverId = receiverMember.user._id.toString();
            try {
                const reactivated = await chatService.clearChat(resolvedChatId, receiverId);
                if (reactivated?.chat?.members) {
                    chat = reactivated.chat;
                    members = chat.members;
                }

                logger.info(`Re-enabled receiver ${receiverId} in chat ${resolvedChatId} on new message`);
            } catch (reactivateErr) {
                logger.error(`Failed to re-enable receiver in chat ${resolvedChatId}: ${reactivateErr.message}`);
            }
        }

        // Validate minimal members for sending
        if (members.filter(m => m.canChat).length < 2) {
            throw new Error('At least 2 members needed to send messages');
        }

        // Prepare message data
        const messageData = {
            chatId: resolvedChatId,
            from: from.id,
            tempId: tempId || new mongoose.Types.ObjectId().toString(),
            content,
            type: resolvedType,
            replyTo,
            encrypted,
            e2ee,
            mediaUrl,
            mediaName,
            thumbnail,
            sentOn: Date.now(),
            sentOnTimestamp: Math.floor(Date.now() / 1000), // For backwards compatibility
            members: members
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
            const update = await chatService.setLatestMessage(resolvedChatId, tempMessage._id, from.id);
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

        // Store public key to chat (fire-and-forget)
        if (publicKey) {
            chatService.updateChatWithPublicKey({ chatId: resolvedChatId, publicKey })
                .catch(err => logger.warn(`Failed to store publicKey to chat: ${err.message}`));
        }

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
                    { publicKey, bytes }
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
            chatId: resolvedChatId || data?.chatId,
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
            } else {
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
                        const chatPayload = updatedChat || {
                            _id: tempMessage.chatId,
                            members: members
                        };

                        // Emit to online recipient
                        socket.to(recipientId).emit('new message received', {
                            message: savedMessage,
                            chat: chatPayload,
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
            
            // Keep muted recipients in the list: notification service downgrades
            // muted chats to silent/background pushes.
            const notifiableReceivers = offlineReceivers;

            if (notifiableReceivers.length > 0) {
                // Fetch receiver login state and filter out logged-out users
                const loginChecks = await Promise.all(
                    notifiableReceivers.map(m => userService.isUserLoggedIn(m.user._id.toString()))
                );
                const loggedInReceivers = notifiableReceivers.filter((m, i) => {
                    if (!loginChecks[i]) {
                        logger.debug(`push:newMessage — receiver ${m.user._id} is not logged in, skipping push`);
                        return false;
                    }
                    return true;
                });

                if (loggedInReceivers.length > 0) {
                    const senderUser = await userService.getUserById(sender.id);
                    if (!senderUser) {
                        logger.warn(`push:newMessage — sender ${sender.id} not found, skipping push`);
                    } else {
                        pushNotificationService.newMessage({
                            message: savedMessage,
                            chat: updatedChat,
                            offlineReceivers: loggedInReceivers,
                            from: senderUser,
                            timestamp: Date.now()
                        });
                    }
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
    const startTime = Date.now();

    try {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid chat messages payload');
        }

        const callback = typeof ack === 'function' ? ack : null;
        const userId = this.user?.id;
        if (!userId) {
            throw new Error('Sender identification failed');
        }

        const rawChatId = data.chatId || data.chat?._id || data.chat?.id;
        const chatId = rawChatId?.toString();
        if (!chatId) {
            throw new Error('chatId is required');
        }

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            throw new Error('Invalid chatId');
        }

        const toMessageDate = data.toMessageDate;
        const parsedHowMany = Number.parseInt(data.howMany, 10);
        const howMany = Number.isFinite(parsedHowMany) && parsedHowMany > 0
            ? Math.min(parsedHowMany, 100)
            : 20;
        const isInitial = !(data.isInitial === false || data.isInitial === 'false');
        const startValue = data.startValue;

        logger.debug(
            `Get conversation: chatId=${chatId}, howMany=${howMany}, isInitial=${isInitial}, toMessageDate=${toMessageDate}, startValue=${startValue}`
        );

        if (!isInitial) {
            if (toMessageDate === undefined || toMessageDate === null || toMessageDate === '') {
                throw new Error('toMessageDate is required when isInitial is false');
            }

            if (!startValue) {
                throw new Error('startValue is required when isInitial is false');
            }
        }

        // Inform message senders that their conversation was read (non-blocking from primary response path).
        const notifyConversationRead = async (inform, senders, targetChatId, readerId) => {
            try {
                if (!inform || !Array.isArray(senders) || senders.length === 0) {
                    return;
                }

                const normalizedSenders = [...new Set(
                    senders
                        .map((member) => member?._id?.toString?.() || member?.toString?.())
                        .filter(Boolean)
                        .filter((senderId) => senderId !== readerId)
                )];

                if (normalizedSenders.length === 0) {
                    return;
                }

                const offlineReceivers = [];
                const eventDate = Date.now();

                await Promise.allSettled(
                    normalizedSenders.map(async (memberId) => {
                        const isOnline = await chatSocketService.isUserConnected(memberId);
                        if (isOnline) {
                            this.to(memberId).emit('conversation read', {
                                chatId: targetChatId,
                                date: eventDate,
                                by: readerId
                            });
                        } else {
                            offlineReceivers.push(memberId);
                        }
                    })
                );

                if (offlineReceivers.length > 0) {
                    pushNotificationService.markConversationSeen({
                        chat: targetChatId,
                        by: readerId,
                        date: eventDate,
                        offlineReceivers,
                        title: 'Mark conversation seen'
                    });
                }
            } catch (notifyError) {
                logger.warn(`messages: failed to notify conversation read: ${notifyError.message}`);
            }
        };

        const result = await messageService.getMessages(
            chatId,
            userId,
            toMessageDate,
            howMany,
            startValue,
            isInitial,
            notifyConversationRead
        );

        const conversationMessages = Array.isArray(result?.messages) ? result.messages : [];

        if (callback) {
            callback({
                total: conversationMessages.length,
                messages: conversationMessages
            });
        }

        logger.info(
            `Conversation fetched: chatId=${chatId}, total=${conversationMessages.length}, userId=${userId}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error getting conversation: ${ex.message}`, {
            chatId: data?.chatId,
            userId: this.user?.id,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                code: ex.code || 'CHAT_MESSAGES_ERROR'
            });
        }
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
    const startTime = Date.now();

    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid reaction payload');
        }

        const { messageId, reaction, date } = data;

        if (!messageId) {
            throw new Error('messageId is required');
        }

        if (!reaction) {
            throw new Error('reaction is required');
        }

        const from = this.user;
        if (!from || !from.id) {
            throw new Error('Sender identification failed');
        }

        logger.debug(`React on Message: messageId=${messageId}`);

        // Save the reaction first.
        const result = await messageService.reactOnMessage(messageId, reaction, from.id, date);
        if (!result || !result.message) {
            throw new Error('Failed to save reaction');
        }

        const message = result.message;
        const userFrom = await userService.getUserById(from.id, true);

        // Get chat members and distribute reaction updates.
        const rawChatId = message?.chatId;
        const normalizedChatId = (typeof rawChatId === 'string')
            ? rawChatId
            : (rawChatId?._id?.toString?.() || rawChatId?.toString?.());

        if (!normalizedChatId || !mongoose.Types.ObjectId.isValid(normalizedChatId)) {
            throw new Error('Invalid chatId in reaction message');
        }

        const chat = await chatService.getChatById(normalizedChatId);
        if (!chat || !Array.isArray(chat.members)) {
            throw new Error('Chat not found for reaction message');
        }

        const offlineReceivers = [];
        const onlineReceivers = [];

        const notifyPromises = chat.members
            .filter(member => member.canChat)
            .map(async (member) => {
                const to = member.user?._id?.toString();
                if (!to || to === from.id) {
                    return;
                }

                const memberIsOnline = await chatSocketService.isUserConnected(to);
                if (memberIsOnline) {
                    this.to(to).emit('message reaction', {
                        reaction: {
                            message: { id: message._id },
                            kind: result.reaction
                        },
                        chat: { id: chat._id },
                        by: from.id,
                        date: Date.now()
                    });
                    onlineReceivers.push(to);
                } else {
                    offlineReceivers.push(member);
                }
            });

        await Promise.allSettled(notifyPromises);

        const payload = {
            message: message._doc || message,
            chat,
            reaction: result.reaction,
            offlineReceivers,
            title: 'Message reaction is stored',
            from: userFrom
        };

        const reactionList = Array.isArray(message?.reactions) ? message.reactions : [];
        const summary = reactionList.reduce((acc, reactionItem) => {
            const kind = reactionItem?.kind;
            if (!kind) return acc;
            acc[kind] = (acc[kind] || 0) + 1;
            return acc;
        }, {});

        const getUserReactionKind = (userId) => {
            const found = reactionList.find((reactionItem) => {
                const fromUserId = reactionItem?.from?._id?.toString?.() || reactionItem?.from?.toString?.();
                return fromUserId === userId;
            });
            return found?.kind || null;
        };

        if (typeof ack === 'function') {
            ack(payload);
        }

        const summaryForSender = {
            messageId: message._id,
            chat: { id: chat._id },
            total: reactionList.length,
            summary,
            lastReaction: {
                kind: result.reaction?.kind || result.reaction,
                by: from.id,
                date: Date.now()
            },
            mine: getUserReactionKind(from.id)
        };

        // Real-time UI refresh event for reaction chips/counts (ActionSheet opener can use this too).
        this.emit('message reaction summary', summaryForSender);

        const summaryNotifyPromises = chat.members
            .filter(member => member.canChat)
            .map(async (member) => {
                const to = member.user?._id?.toString();
                if (!to || to === from.id) {
                    return;
                }

                const memberIsOnline = await chatSocketService.isUserConnected(to);
                if (!memberIsOnline) {
                    return;
                }

                this.to(to).emit('message reaction summary', {
                    messageId: message._id,
                    chat: { id: chat._id },
                    total: reactionList.length,
                    summary,
                    lastReaction: {
                        kind: result.reaction?.kind || result.reaction,
                        by: from.id,
                        date: Date.now()
                    },
                    mine: getUserReactionKind(to)
                });
            });

        await Promise.allSettled(summaryNotifyPromises);

        if (offlineReceivers.length > 0) {
            pushNotificationService.reactOnMessage(payload);
        }

        logger.info(
            `Reaction processed: messageId=${messageId}, online=${onlineReceivers.length}, offline=${offlineReceivers.length}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error in reactOnMessage handler: ${ex.message}`, {
            messageId: data?.messageId,
            userId: this.user?.id,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                code: ex.code || 'REACTION_ERROR'
            });
        }
    }
}

/**
 * Fetch all reactions for a message.
 * Intended for ActionSheet-style UI when user taps on reactions.
 */
const messageReactions = async function(data, ack) {
    const startTime = Date.now();

    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid message reactions payload');
        }

        const { messageId } = data;
        if (!messageId) {
            throw new Error('messageId is required');
        }

        const requester = this.user;
        if (!requester || !requester.id) {
            throw new Error('Sender identification failed');
        }

        const message = await messageService.getByIdOrClientId(messageId);
        if (!message) {
            throw new Error('Message not found');
        }

        const rawChatId = message.chatId;
        const chatId = (typeof rawChatId === 'string')
            ? rawChatId
            : (rawChatId?._id?.toString?.() || rawChatId?.toString?.());

        if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
            throw new Error('Invalid chatId in message');
        }

        // Authorization check: requester must be an active member of this chat.
        await chatService.getById(chatId, requester.id, false);

        const reactions = (message.reactions || []).map((reaction) => ({
            id: reaction._id,
            kind: reaction.kind,
            date: reaction.date,
            editedOn: reaction.editedOn,
            by: reaction.from,
            mine: reaction.from?._id?.toString?.() === requester.id
        }));

        const summary = reactions.reduce((acc, reaction) => {
            const key = reaction.kind || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        if (typeof ack === 'function') {
            ack({
                messageId: message._id,
                chatId,
                total: reactions.length,
                summary,
                reactions,
                title: 'Message reactions fetched'
            });
        }

        logger.info(
            `Message reactions fetched: messageId=${messageId}, total=${reactions.length}, userId=${requester.id}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error in messageReactions handler: ${ex.message}`, {
            messageId: data?.messageId,
            userId: this.user?.id,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                code: ex.code || 'MESSAGE_REACTIONS_ERROR'
            });
        }
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
    const startTime = Date.now();

    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid delete message payload');
        }

        const { messageId, forEveryone = false } = data;
        if (!messageId) {
            throw new Error('messageId is required');
        }

        const from = this.user;
        if (!from || !from.id) {
            throw new Error('Sender identification failed');
        }

        logger.debug(`Delete message: ${messageId}, forEveryone=${Boolean(forEveryone)}`);

        const result = await messageService.deleteMessage(messageId, from.id, Boolean(forEveryone));
        if (!result || !result.message) {
            throw new Error('Failed to delete message');
        }

        const message = result.message;

        const rawChatId = message?.chatId;
        const normalizedChatId = (typeof rawChatId === 'string')
            ? rawChatId
            : (rawChatId?._id?.toString?.() || rawChatId?.toString?.());

        if (!normalizedChatId || !mongoose.Types.ObjectId.isValid(normalizedChatId)) {
            throw new Error('Invalid chatId in deleted message');
        }

        let chat;
        try {
            const res = await chatService.updateChatWithLastMessage(normalizedChatId);
            chat = res.chat;
        } catch (updateErr) {
            logger.warn(`deleteMessage: failed to update chat last message (${normalizedChatId}): ${updateErr.message}`);
            // Fallback to fetching chat details so delivery can continue.
            chat = await chatService.getChatById(normalizedChatId);
        }

        if (chat) {
            chat.unreadMessages = 0;
        }

        const offlineReceivers = [];
        const onlineReceivers = [];
        let senderUser = null;

        if (Boolean(forEveryone) && chat?.members?.length) {
            senderUser = await userService.getUserById(from.id, true);

            const notifyPromises = chat.members
                .filter(member => member.canChat)
                .map(async (member) => {
                    const to = member.user?._id?.toString();
                    if (!to || to === from.id) {
                        return;
                    }

                    const memberIsOnline = await chatSocketService.isUserConnected(to);
                    if (memberIsOnline) {
                        this.to(to).emit('message deleted', {
                            id: message._id,
                            forEveryone: true,
                            dateDeleted: message.deleted?.date,
                            chat: { id: chat._id }
                        });
                        onlineReceivers.push(to);
                    } else {
                        offlineReceivers.push(member);
                        await userService.setContentStorageFor(member.user, from, 'delete', { message });
                    }
                });

            await Promise.allSettled(notifyPromises);
        }

        const payload = {
            message,
            chat,
            offlineReceivers,
            deleted: true,
            title: result.title || 'Message marked as deleted',
            from: senderUser || from
        };

        if (typeof ack === 'function') {
            ack(payload);
        }

        if (Boolean(forEveryone) && offlineReceivers.length > 0) {
            pushNotificationService.messageDeleted(payload);
        }

        logger.info(
            `Delete processed: messageId=${messageId}, forEveryone=${Boolean(forEveryone)}, ` +
            `online=${onlineReceivers.length}, offline=${offlineReceivers.length}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error in deleteMessage handler: ${ex.message}`, {
            messageId: data?.messageId,
            forEveryone: data?.forEveryone,
            userId: this.user?.id,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                deleted: false,
                code: ex.code || 'DELETE_MESSAGE_ERROR'
            });
        }
    } 
}

/**
 * Mark a message seen from receivers
 *
 * @param {*} data
 * @param {*} ack
 */
const messageSeen = async function(data, ack) {
    const startTime = Date.now();

    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid message seen payload');
        }

        const from = this.user.id;
        const messageId = data.messageId;
        const messageDate = data.date;

        if (!from) {
            throw new Error('User ID is missing from socket context');
        }

        if (!messageId) {
            throw new Error('messageId is required');
        }

        if (!messageDate) {
            throw new Error('date is required');
        }

        const offlineReceivers = [];

        const message = await messageService.messageSeen(from, messageId, messageDate);
        if (!message || !message.from) {
            throw new Error('Invalid message seen response');
        }

        const creator = message.from.toString();
        const memberIsOnline = await chatSocketService.isUserConnected(creator);

        if (memberIsOnline) {
            this.to(creator).emit('message seen by', {
                messageId,
                by: from,
                date: messageDate
            });
        } else {
            offlineReceivers.push(creator);
        }

        if (typeof ack === 'function') {
            ack({
                messageId,
                to: creator,
                title: 'Message seen ack sent'
            });
        }

        if (offlineReceivers.length > 0) {
            pushNotificationService.markMessageSeen({
                messageId,
                by: from,
                date: messageDate,
                offlineReceivers,
                title: 'Mark message seen'
            });
        }

        logger.info(
            `Message seen processed: messageId=${messageId}, by=${from}, notifiedOnline=${memberIsOnline}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error in messageSeen handler: ${ex.message}`, {
            messageId: data?.messageId,
            by: this.user?.id,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                code: ex.code || 'MESSAGE_SEEN_ERROR'
            });
        }
    }
};

/**
 * Mark a chat message as delivered/received by/to receivers
 *
 * @param {*} data
 * @param {*} ack
 */
const messageDelivered = async function(data, ack) {
    const startTime = Date.now();

    try { 
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid message delivered payload');
        }

        const from = data.from;
        const messageId = data.messageId;
        const messageDate = data.date;

        if (!from) {
            throw new Error('from is required');
        }

        if (!messageId) {
            throw new Error('messageId is required');
        }

        if (!messageDate) {
            throw new Error('date is required');
        }

        const offlineReceivers = [];

        const message = await messageService.messageDelivered(from, messageId, messageDate);
        if (!message || !message.from) {
            throw new Error('Invalid message delivered response');
        }

        const creator = message.from.toString();
        const memberIsOnline = await chatSocketService.isUserConnected(creator);

        if (memberIsOnline) {
            this.to(creator).emit('message received by', {
                messageId,
                by: from,
                date: messageDate
            });
        } else {
            offlineReceivers.push(creator);
        }

        if (typeof ack === 'function') {
            ack({
                messageId,
                to: creator,
                title: 'Message delivered ack sent'
            });
        }

        if (offlineReceivers.length > 0) {
            pushNotificationService.markMessageReceived({
                messageId,
                by: from,
                date: messageDate,
                offlineReceivers,
                title: 'Mark message delivered'
            });
        }

        logger.info(
            `Message delivered processed: messageId=${messageId}, by=${from}, notifiedOnline=${memberIsOnline}, duration=${Date.now() - startTime}ms`
        );
    } catch (ex) {
        logger.error(`Error in messageDelivered handler: ${ex.message}`, {
            messageId: data?.messageId,
            by: data?.from,
            duration: Date.now() - startTime
        });

        if (typeof ack === 'function') {
            ack({
                error: ex.message,
                code: ex.code || 'MESSAGE_DELIVERED_ERROR'
            });
        }
    }
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

        // Normalize supported payload shapes:
        // 1) { chatId, date, senders }
        // 2) [{ chatId, date, senders }]
        // 3) { data: [{ chatId, date, senders }], from }
        let chatId;
        let date;
        let senders;
        let normalizedData = {};

        if (!data) {
            console.warn(`[Mark Conversation Seen] No data object received`);
        } else if (typeof data === 'string') {
            console.warn(`[Mark Conversation Seen] Data received as string, assuming it's chatId`);
            normalizedData = { chatId: data };
        } else if (Array.isArray(data)) {
            normalizedData = data[0] || {};
        } else if (typeof data === 'object') {
            if (Array.isArray(data.data)) {
                normalizedData = data.data[0] || {};
            } else {
                normalizedData = data;
            }
        }

        chatId = normalizedData.chatId;
        date = normalizedData.date;
        senders = normalizedData.senders;
        
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
        const debugData = (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.data))
            ? (data.data[0] || {})
            : (Array.isArray(data) ? (data[0] || {}) : (data || {}));
        console.error(`[Error] Conversation seen failed:`, {
            message: ex.message,
            stack: ex.stack.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
            data: {
                dataType: typeof data,
                dataKeys: Object.keys(data || {}),
                chatId: debugData?.chatId,
                date: debugData?.date,
                sendersCount: debugData?.senders?.length,
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