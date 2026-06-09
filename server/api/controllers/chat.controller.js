const MessageService = require('../../services/domain/chat/message.service');
const ChatService = require('../../services/domain/chat/chat.service');
const UserService = require('../../services/domain/user/user.service');
const AWSS3Service = require('../../services/external/aws/s3.service');
const CS = require('../../socket/chat.service');
const pushNotificationService = require('../../notifications/index');
const { getIO } = require('../../socket/io');
const logger = require('../../utils/logger');

const chatService = new ChatService();
const userService = new UserService();
const messageService = new MessageService();
const awsUploadService = new AWSS3Service();
/**
 * New chat
 *
 * @param {*} req
 * @param {*} res
 */
const newChat = async (req, res) => {
    try {
        const { chat } = req.body;

        // Validate chat object exists
        if (!chat) {
            return res.status(400).json({ status: 'error', message: 'Chat object is required' });
        }

        const userId = req.decodedToken.userId;
        if (!userId) {
            return res.status(401).json({ status: 'error', message: 'User ID not found in token' });
        }

        chat.userId = userId;
        const data = { chat: chat };
        // Create in-memory chat object
        // const tempChat = await chatService.create(data);
        // Do something with the newly chat object
        // the temp chat is in memory object, not stored to db

        // Save the chat
        chatService.create(data).then((result) => {
            res.status(200).json({ status: 'success', message: result.message, chat: result.chat })
        }).catch((err) => {
            logger.error('New chat error:', err);
            res.status(500).json({ status: 'error', message: err.message })
        })
    } catch (error) {
        logger.error('New chat exception:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
}

/**
 * Edit an existing chat
 *
 * @param {*} req
 * @param {*} res
 */
const edit = async (req, res) => {
    const { id } = req.params;
    const { name, imageUrl } = req.body;

    // TODO: Set the response status codes accordingly to the response
    chatService.edit(id, name, imageUrl).then((result) => {
        res.status(200).json({status: 'success', message: result.message, chat: result.chat })
    }).catch((err) => {
        logger.error('Edit chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

/**
 * Add new member to a chat
 *
 * @param {*} req
 * @param {*} res
 */
const addNewMembers = async (req, res) => {
    // const { id } = req.params;
    const { chatId, members } = req.body;

    const ids = await userService.getUserIds(members);

    // TODO: Set the response status codes accordingly to the response
    chatService.newMembers(chatId, [ids]).then((result) => {
        res.status(200).json({status: 'success', chat: result })
    }).catch((err) => {
        logger.error('Add new members error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

/**
 * G~et all chats
 *
 * @param {*} _
 * @param {*} res
 */
const all = async (req, res) => {
    // const userId = req.body.userId;
    const userId = req.decodedToken.userId;

    const { skip } = req.query

    chatService.getAll(userId, parseInt(skip))
    .then(async (chats) => { 
        res.status(200).json({status: 'success', result: { total: chats.length, chats: chats }}) 
    }).catch((err) => {
        logger.error('Get all chats error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}
 

/**
 * Get a chat by an id
 *
 * @param {*} req
 * @param {*} res
 */
const chatById = (req, res) => {
    const { id } = req.params;
    const userId = req.decodedToken.userId;

    chatService.getById(id, userId).then((chat) => {
        res.status(200).json({ status: 'success', chat: chat })
    }).catch((err) => {
        logger.error('Get chat by id error:', err);
        res.status(500).json({ status: 'error', message: err.message })
    })
}

/**
 * Delete a chat
 *
 * @param {*} req
 * @param {*} res
 */
const deleteChat = (req, res) => {
    const {id} = req.params;
    const userId = req.decodedToken.userId;

    chatService.deleteChat(id).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Delete chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    });
}

/**
 * Make a chat a favorites
 *
 * @param {*} req
 * @param {*} res
 */
const favoriteChat = (req, res) => {
    const {id} = req.params;
    const userId = req.decodedToken.userId;

    chatService.favoriteChat(userId, id).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Favorite chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    });
}

/**
 * Block an active chat against notifications
 *
 * @param {*} req
 * @param {*} res
 */
const blockChat = (req, res) => {
    const { id } = req.params;
    const { reason, description, status } = req.body;
    const userId = req.decodedToken.userId;

    const shouldBlock = (status == 'true');
    chatService.blockChat(userId, id, shouldBlock, reason, description).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Block chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    });
}

/**
 * Mute an active chat
 *
 * @param {*} req
 * @param {*} res
 */
const muteChat = (req, res) => {
    const {id} = req.params;
    const userId = req.decodedToken.userId;

    chatService.muteChat(userId, id).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Mute chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    });
}

/**
 *
 * Leave chat
 * @param {*} req
 * @param {*} res
 */
const leaveChat = (req, res) => {
    // MARK: The user id in future will be taken from the Auth Token
    const {id} = req.params;
    const userId = req.decodedToken.userId;
    chatService.leaveChat(userId, id).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Leave chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

const getMessagesForChat = (req, res) => {
    const chatId = req.params.chatId || req.params.id;
    const { toMessageDate, startValue } = req.query;
    const parsedHowMany = Number.parseInt(req.query.howMany, 10);
    const howMany = Number.isFinite(parsedHowMany) && parsedHowMany > 0 ? parsedHowMany : 20;
    const isInitial = !(req.query.isInitial === false || req.query.isInitial === 'false');
    const userId = req.decodedToken.userId;

    messageService.getMessages(chatId, userId, toMessageDate, howMany, startValue, isInitial).then((result) => {
        const messages = result.messages || [];
        //res.status(200).json({ status: 'success', total: result.totalMessages, totalPages: result.totalPages, messages: result.messages, currentPage: result.currentPage, messagesPerPage: result.messagesPerPage });
        res.status(200).json({status: 'success', total: messages.length, messages: messages})
    }).catch((err) => {
        logger.error('Get messages for chat error:', err);
        res.status(500).json({ status: 'error', message: err.message })
    })
}

/**
 * G~et all chats
 *
 * @param {*} _
 * @param {*} res
 */
const allChats = async (req, res) => {
    const userId = req.decodedToken.userId;
    const skip = req.params

    chatService.getChatsForUser(userId, false, -1).then(async (chats) => {
        try {
            const unread = await chatService.countTotalUnreadChatsForUser(userId);
            res.status(200).json({status: 'success', result: { total: chats.length, chats: chats, totalUnread: unread }})
        } catch (ex) {
            res.status(200).json({status: 'success', result: { total: chats.length, chats: chats }})
        }
    }).catch((err) => {
        logger.error('Get all chats error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const totalUnreadChatsForUser = (req, res) => {
    const userId = req.decodedToken.userId;

    chatService.countTotalUnreadChatsForUser(userId).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        logger.error('Total unread chats error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const getUserIds = async (req, res) => {
    const {users} = req.body;

    userService.getUserIds(users).then((userIds) => {
        res.status(200).json({status: 'success', users: userIds})
    }).catch((err) => {
        logger.error('Get user ids error:', err);
        res.status(500).json({status: 'error', message: err.message});
    })
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const uploadMedia = async (req, res) => {
    const file = req.file;
    const fileName = req.body.fileName

    awsUploadService.uploadMedia(file, fileName).then((result) => {
        res.status(200).json({ status: 'success', result: result });
    }).catch((err) => {
        logger.error('Upload media error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    })
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const deleteMedia = async (req, res) => {
    const { id } = req.params;

    awsUploadService.deleteMedia(id).then(uploadedUrl => {
        res.status(200).json({ status: 'success', result: uploadedUrl });
    }).catch(err => {
        logger.error('Delete media error:', err);
        res.status(500).json({ status: 'error', result: err });
    })
}

/**
 * Get a chat by an id
 *
 * @param {*} req
 * @param {*} res
 */
const messageById = (req, res) => {
    const { id } = req.params;

    messageService.getById(id).then((message) => {
        res.status(200).json({ status: 'success', message: message })
    }).catch((err) => {
        logger.error('Get message by id error:', err);
        res.status(500).json({ status: 'error', error: err.message })
    })
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const messageReceivedAck = async (req, res) => {
    let { id, date } = req.body;
    let from = req.decodedToken.userId;

    if (id == '') {
        return res.status(500).json({ status: 'error', error: new Error('message id is missing') });
    }

    if (typeof from === 'number') {
        from = await userService.getUserIds([from]);
    }

    if (typeof date === 'string') {
        date = parseInt(date);
    }

    updateMessageReceived(id, from, date).then(result => {
        res.status(200).json({status: "success", result: result})
    }).catch(err => {
        logger.error('Message received ack error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    });
}

const updateMessageReceived = async (messageById, from, date) => {
    return new Promise((resolve, reject) => {
        messageService.messageDelivered(from, messageById, date).then(async (message) => {
            const creator = message.from.toString();
            const IO = getIO();
            const socketService = new CS();

            const memberIsOnline = await socketService.isUserConnected(creator);

            if (memberIsOnline) {
                IO.to(creator).emit('message received by', {
                    messageId: messageById,
                    by: from,
                    date: date
                });
            } else {
                /// Offline people. Send a push notification
                // offlineReceivers.push(creator);
                //MARK: TODO: FInish the message ack
                pushNotificationService.markMessageReceived({
                    messageId: messageById,
                    by: from,
                    date: date,
                    offlineReceivers: [creator],
                    title: 'Mark message delivered'
                });
            }
            resolve(true);
            logger.info('API: Message ACK for delivered sent');
        }).catch((err) => {
            logger.error(`Error while emitting message received to sender: ` + err.message);
            reject(err);
        });
    });
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const messageSeenAck = async (req, res) => {
    let { id, date } = req.body;
    let from = req.decodedToken.userId;

    if (typeof from === 'number') {
        from = await userService.getUserIds([from]);
    }

    if (typeof date === 'string') {
        date = parseInt(date);
    }

    updateMessageSeen(id, from, date).then(result => {
        res.status(200).json({status: "success", result: result})
    }).catch(err => {
        logger.error('Message seen ack error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    });
}

const updateMessageSeen = async (messageById, from, date) => {
    return new Promise((resolve, reject) => {
        messageService.messageSeen(from, messageById, date).then(async (message) => {
            const creator = message.from.toString();
            const IO = getIO();
            const socketService = new CS();

            const memberIsOnline = await socketService.isUserConnected(creator);

            if (memberIsOnline) {
                IO.to(creator).emit('message seen by', {
                    messageId: messageById,
                    by: from,
                    date: date
                });
            } else {
                /// Offline people. Send a push notification
                // offlineReceivers.push(creator);
                //MARK: TODO: FInish the message ack
                pushNotificationService.markMessageSeen({
                    messageId: messageById,
                    by: from,
                    date: date,
                    offlineReceivers: [creator],
                    title: 'Mark message delivered'
                });
            }
            resolve(true);
            logger.info('API: Message ACK for seen/read sent');
        }).catch((err) => {
            logger.error(`Error while emitting message seen to sender: ` + err.message);
            reject(err);
        });
    });
}

/**
 * Send a message
 *
 * @param {*} req
 * @param {*} res
 */
const sendMessage = async (req, res) => {
    const startTime = Date.now();
    try {
        logger.info(`API: Send message: ${Date()}`);
        const { content, chatId, type, messageId: tempId, date, senderCopy, publicKey, bytes } = req.body;

        if (!chatId || !content) {
            return res.status(400).json({ status: 'error', message: 'chatId and content are required' });
        }

        const validTypes = ['text', 'image', 'video', 'screenshot_taken'];
        if (type && !validTypes.includes(type)) {
            return res.status(400).json({ status: 'error', message: `Invalid message type: ${type}` });
        }

        let from = req.decodedToken.userId;
        if (typeof from === 'number') {
            from = await userService.getUserIds([from]);
        }

        // Duplicate check
        if (tempId) {
            const isDuplicate = await messageService.isDuplicate(tempId, chatId);
            if (isDuplicate) {
                logger.warn(`Duplicate message detected: tempId=${tempId}`);
                return res.status(200).json({ warning: 'Duplicate message', isDuplicate: true });
            }
        }

        // Get chat and verify sender membership
        let chat;
        try {
            chat = await chatService.getById(chatId, from);
        } catch (err) {
            throw new Error(`Unable to verify chat membership: ${err.message}`);
        }

        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found or access denied' });
        }

        let members = chat.members;
        const senderMember = members.find(m => m.user._id.toString() === from.toString());

        if (!senderMember || !senderMember.canChat) {
            return res.status(403).json({ status: 'error', message: 'Sender is not authorized to send messages in this chat' });
        }

        // Re-enable receiver if they previously left this chat
        const receiverMember = members.find(m => m.user._id.toString() !== from.toString());
        if (receiverMember && !receiverMember.canChat && receiverMember.leftOn) {
            const receiverId = receiverMember.user._id.toString();
            try {
                const reactivated = await chatService.clearChat(chatId, receiverId);
                if (reactivated?.chat?.members) {
                    chat = reactivated.chat;
                    members = chat.members;
                }

                const IO = getIO();
                const socketService = new CS();
                const receiverIsOnline = await socketService.isUserConnected(receiverId);
                if (receiverIsOnline) {
                    IO.to(receiverId).emit('new chat created', { chat });
                } else {
                    pushNotificationService.newChatCreated({ chat, from: { id: from }, offlineReceivers: [receiverMember] });
                }
                logger.info(`Re-enabled receiver ${receiverId} in chat ${chatId} on new message`);
            } catch (reactivateErr) {
                logger.error(`Failed to re-enable receiver in chat ${chatId}: ${reactivateErr.message}`);
            }
        }

        if (members.filter(m => m.canChat).length < 2) {
            return res.status(400).json({ status: 'error', message: 'At least 2 members needed to send messages' });
        }

        const mongoose = require('mongoose');
        const messageData = {
            content,
            chatId,
            type: type || 'text',
            senderCopy: senderCopy ?? null,
            sentOn: Date.now(),
            sentOnTimestamp: Math.floor(Date.now() / 1000),
            members,
            from,
            tempId: tempId || new mongoose.Types.ObjectId().toString()
        };

        const tempMessage = await messageService.create(messageData);
        const result = await messageService.save(tempMessage);

        if (!result || !result.message) {
            throw new Error('Failed to persist message');
        }

        logger.info(`Message saved: ${result.message._id} in ${Date.now() - startTime}ms`);

        let updatedChat;
        try {
            const update = await chatService.setLatestMessage(chatId, tempMessage._id, from);
            updatedChat = update.chat;
        } catch (err) {
            logger.error(`Failed to update last message: ${err.message}`);
            updatedChat = chat;
        }

        // Respond immediately (equivalent to socket ACK)
        res.status(200).json({
            status: 'success',
            title: 'Message Sent',
            message: result.message,
            chat: updatedChat,
            tempId: messageData.tempId
        });

        // Store public key (fire-and-forget)
        if (publicKey) {
            chatService.updateChatWithPublicKey({ chatId, publicKey })
                .catch(err => logger.warn(`Failed to store publicKey to chat: ${err.message}`));
        }

        // Async delivery — non-blocking
        setImmediate(async () => {
            try {
                const IO = getIO();
                const socketService = new CS();
                const deliveredTo = [];
                const offlineReceivers = [];
                const blockedReceivers = [];

                const deliveryPromises = members
                    .filter(member => member.canChat && member.user._id.toString() !== from.toString())
                    .map(async (member) => {
                        const recipientId = member.user._id.toString();
                        try {
                            if (member.options?.blocked) {
                                blockedReceivers.push(recipientId);
                                messageService.setMessageNotVisible(tempMessage._id)
                                    .catch(err => logger.warn(`Failed to mark invisible: ${err.message}`));
                                return;
                            }

                            const isOnline = await socketService.isUserConnected(recipientId);
                            if (isOnline) {
                                const unreadMessages = await chatService.countUnreadMessagesForChat(updatedChat._id, recipientId);
                                IO.to(recipientId).emit('new message received', {
                                    message: result.message,
                                    chat: { ...(updatedChat.toObject?.() ?? updatedChat), unreadMessages },
                                    publicKey,
                                    bytes,
                                    sentAt: Date.now()
                                });
                                deliveredTo.push(recipientId);
                            } else {
                                offlineReceivers.push(member);
                            }
                        } catch (err) {
                            logger.error(`Error processing recipient ${recipientId}: ${err.message}`);
                        }
                    });

                await Promise.allSettled(deliveryPromises);

                if (deliveredTo.length > 0) {
                    try {
                        await messageService.messageDelivered(deliveredTo, result.message._id.toString(), Date.now());
                        IO.to(from.toString()).emit('message delivered to', {
                            messageId: result.message._id,
                            deliveredTo,
                            timestamp: Date.now()
                        });
                    } catch (err) {
                        logger.error(`Failed to update delivery status: ${err.message}`);
                    }
                }

                if (offlineReceivers.length > 0) {
                    try {
                        const notifiableReceivers = offlineReceivers.filter(m => !m.options?.muted);
                        if (notifiableReceivers.length > 0) {
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
                                const senderUser = await userService.getUserById(from.toString());
                                if (!senderUser) {
                                    logger.warn(`push:newMessage — sender ${from} not found, skipping push`);
                                } else {
                                    pushNotificationService.newMessage({
                                        message: result.message,
                                        chat: updatedChat,
                                        offlineReceivers: loggedInReceivers,
                                        from: senderUser,
                                        timestamp: Date.now()
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        logger.error(`Error queueing push notifications: ${err.message}`);
                    }
                }

                logger.info(
                    `Message delivery: online=${deliveredTo.length}, offline=${offlineReceivers.length}, blocked=${blockedReceivers.length}, duration=${Date.now() - startTime}ms`
                );
            } catch (err) {
                logger.error(`Error distributing message ${tempMessage._id}: ${err.message}`);
            }
        });

        await updateMessageSeen(tempId, from, date);

    } catch (ex) {
        logger.error('Send message unexpected error:', ex);
        if (!res.headersSent) {
            res.status(400).json({ status: 'error', message: ex.message });
        }
    }
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const conversationSeen = async (req, res) => {
    const { id, date, senders } = req.body;
    let from = req.decodedToken.userId;

    if (typeof from === 'number') {
        from = await userService.getUserIds([from]);
    }

    logger.info('API: Mark conversation seen');

    updateConversationSeen(id, from, date, senders).then(result => {
        res.status(200).json({status: "success", result: result})
    }).catch(err => {
        logger.error('Conversation seen error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    });
}

const updateConversationSeen = async (chatId, from, date, senders) => {
    return new Promise((resolve, reject) => {
        messageService.markConversationSeen(from, chatId, date).then(async (result) => {
            const IO = getIO();
            const socketService = new CS();

            for (const member of senders) {
                const memberIsOnline = await socketService.isUserConnected(member);

                if (memberIsOnline) {
                    IO.to(member).emit('conversation read', {
                        chatId: chatId,
                        by: from,
                        date: date
                    });
                }
            }

            resolve({
                chatId: chatId,
                result: result
            });
        }).catch((err) => {
            logger.error(`Error while emitting chat seen to sender: ` + err.message);
            reject(err);
        });
    });
}

/**
 * GET /api/chat/exists?userId=:userId
 * Returns whether a direct chat exists between the authenticated user and userId.
 */
const chatExists = async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId query param is required' });

    const me = req.decodedToken.userId;

    try {
        const Chat = require('mongoose').model('Chat');
        const chat = await Chat.findOne({
            'members.user': { $all: [me, userId] },
        }).select('_id').lean();

        return res.status(200).json({ exists: !!chat, chatId: chat?._id?.toString() ?? null });
    } catch (error) {
        logger.error('Chat exists error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to check chat existence' });
    }
};

/**
 * GET /api/chat/messages/count?userId=:userId
 * Returns total number of messages in the chat between the authenticated user and userId.
 */
const getMessageCountForUser = async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId query param is required' });

    const me = req.decodedToken.userId;

    try {
        const mongoose = require('mongoose');
        const Chat    = mongoose.model('Chat');
        const Message = mongoose.model('Message');

        const chat = await Chat.findOne({
            'members.user': { $all: [me, userId] },
        }).select('_id').lean();

        if (!chat) return res.status(200).json({ count: 0 });

        const count = await Message.countDocuments({
            chatId: chat._id,
            'deleted.forEveryone': { $ne: true },
        });

        return res.status(200).json({ count });
    } catch (error) {
        logger.error('Message count error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to get message count' });
    }
};

module.exports = {
    all,
    newChat,
    deleteChat,
    chatById,
    leaveChat,
    favoriteChat,
    muteChat,
    blockChat,
    getMessagesForChat,
    allChats,
    totalUnreadChatsForUser,
    uploadMedia,
    deleteMedia,
    messageById,
    messageReceivedAck,
    messageSeenAck,
    sendMessage,
    conversationSeen,
    chatExists,
    getMessageCountForUser,
}
