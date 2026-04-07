const MessageService = require('../../services/domain/chat/message.service');
const ChatService = require('../../services/domain/chat/chat.service');
const UserService = require('../../services/domain/user/user.service');
const AWSS3Service = require('../../services/external/aws/s3.service');
const CS = require('../../socket/chat.service');
const PushNotificationService = require('../../notifications/index');
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
    const { chat } = req.body;

    const userId = req.decodedToken.userId;
    chat.userId = userId;
    const data = { chat: chat};
    // Create in-memory chat object
    // const tempChat = await chatService.create(data);
    // Do something with the newly chat object
    // the temp chat is in memory object, not stored to db

    // Save the chat
    chatService.create(data).then((result) => {
        res.status(200).json({status: 'success', message: result.message, chat: result.chat })
    }).catch((err) => {
        logger.error('New chat error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
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

    chatService.getAll(userId, parseInt(skip)).then(async (chats) => {
        // try {
        //     const unread = await chatService.countTotalUnreadChatsForUser(userId);
        //     res.status(200).json({status: 'success', result: { total: chats.length, chats: chats, totalUnread: unread }})
        // } catch (ex) {
            res.status(200).json({status: 'success', result: { total: chats.length, chats: chats }})
        // }
    }).catch((err) => {
        logger.error('Get all chats error:', err);
        res.status(500).json({status: 'error', message: err.message})
    })
}

/**
 * G~et all favorite chats
 *
 * @param {*} _
 * @param {*} res
 */
const allFavorites = (req, res) => {
    // const userId = req.body.userId;
    const userId = req.decodedToken.userId;

    chatService.getAllFavoriteChats(userId).then((chats) => {
        res.status(200).json({status: 'success', result: { total: chats.length, chats: chats }})
    }).catch((err) => {
        logger.error('Get all favorite chats error:', err);
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
    const { id } = req.params;
    const { toMessageDate } = req.query;
    const userId = req.decodedToken.userId;

    messageService.getMessages(id, userId, toMessageDate).then((result) => {
        //res.status(200).json({ status: 'success', total: result.totalMessages, totalPages: result.totalPages, messages: result.messages, currentPage: result.currentPage, messagesPerPage: result.messagesPerPage });
        res.status(200).json({status: 'success', total: result.length, messages: result})
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
                new PushNotificationService().markMessageReceived({
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
                new PushNotificationService().markMessageSeen({
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
    try {
        logger.info(`API: Send message: ${Date()}`)
        const { content, chatId, type, messageId, date } = req.body;

        var from = req.decodedToken.userId;

        if (typeof from === 'number') {
            from = await userService.getUserIds([from]);
        }

        const data = {
            content: content,
            chatId: chatId,
            type: type
        }

        // Get the chat
        const chat = await chatService.getById(chatId, from);
        // // Remove the sender from the members
        const members = chat.members

        const json = data;
        json.sentOn = Date.now();
        json.members = members;
        json.from = from;

        // Create a temporary message
        const tempMessage = await messageService.create(json);
        // Save the message
        messageService.save(tempMessage)
        .then(async (result) => {
            var deliveredTo = [];
            var offlineReceivers = [];
            // Set to chat this message
            //MARK: If not necessary, move these two lines at the end
            const update = await chatService.setLatestMessage(data.chatId, tempMessage._id, from);
            const chat = update.chat;

            const object = {
                message: tempMessage,
                chat: chat
            }

            const IO = getIO();
            const socketService = new CS();

            // // Process the message
            for (const member of members) {
                // Check if the user can chat
                const canChat = member.canChat;
                if (!canChat) continue;

                const to = member.user._id.toString();
                if (to == from) continue;

                const memberIsOnline = await socketService.isUserConnected(to);

                if (memberIsOnline) {
                    const unreadMessages = await chatService.countUnreadMessagesForChat(chat._id, to)
                    object.chat.unreadMessages = unreadMessages;

                    IO.to(to).emit('new message received', object);

                    deliveredTo.push(to);
                } else {
                    /// Offline people. Send a push notification
                    // logger.info(`Offline member: ${member.user.device}`);
                    if (!member.options.muted) {
                        offlineReceivers.push(member.user);
                    }
                }
            }

            if (deliveredTo.length) {
                //Update the status of the message to delivered for users
                await messageService.messageDelivered(deliveredTo, result.message._id, Date.now());
            }

            // Send the response back
            res.status(200).json({ status: 'success', title: 'Message Sent', message: result.message, chat: chat, deliveredTo: deliveredTo });

            const obj = { message: result.message, chat: chat, offlineReceivers: offlineReceivers };

            return new Promise((resolve) => {
                resolve(obj)
            });
        }).then(async result => {
            if (result.offlineReceivers.length) {
                const pushNotification = new PushNotificationService();
                // Send the push notifications
                let fromUser = await userService.getUserById(from, true);
                result.from = fromUser;
                pushNotification.newMessage(result);
            } else {
                logger.info(`No offline users`)
            }

            await updateMessageSeen(messageId, from, date);
        }).catch((err) => {
            logger.error(`Send message error: ${err.message}`)
            res.status(400).json({ status: 'error', message: err.message });
        });
    } catch (ex) {
        logger.error('Send message unexpected error:', ex);
        res.status(400).json({ status: 'error', message: ex.message });
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

module.exports = {
    all,
    allFavorites,
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
}
