const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Reaction = mongoose.model('Reaction');

const MessageModel = mongoose.model('Message');
const MediaModel = mongoose.model('Media');

const ChatService = require('./chat.service');
const UserService = require('../user/user.service');
const utils = require('../../../utils/index');
const { normalizeUserId } = require('../../../utils/user.utils');
const { validateRequired, validateObjectId, validateString, validateFields } = require('../../../utils/validation.utils');

class MessageService {
    constructor() {
        this.model = MessageModel;
        this.chatService = new ChatService();
    }

    /**
     * Check if a message with the same tempId already exists (idempotency check)
     * @param {string} tempId - Temporary message ID from client
     * @param {string} chatId - Chat ID
     * @returns {Promise<boolean>} - True if duplicate exists
     */
    async isDuplicate(tempId, chatId) {
        if (!tempId || !chatId) return false;

        const existing = await this.model.findOne({
            tempId: tempId,
            chatId: chatId
        }).lean();

        return !!existing;
    }

    /**
     * Create a new Message object in memory (not saved to database)
     */
    async create(data) {
        validateFields(data, {
            tempId: { type: 'string', required: true },
            chatId: { type: 'objectId', required: true },
            from: { type: 'string', required: true },
            type: { type: 'string', required: true, enum: ['text', 'image', 'video', 'audio', 'document', 'share contact'] },
            sentOn: { type: 'date', required: true },
            members: { type: 'array', required: true, minLength: 1 }
        });

        // Check for duplicate messages (idempotency)
        const isDuplicate = await this.isDuplicate(data.tempId, data.chatId);
        if (isDuplicate) {
            throw new Error('Message with this ID already exists - duplicate detected');
        }

        const message = new this.model({
            tempId: data.tempId,
            chatId: data.chatId,
            from: data.from,
            kind: data.type,
            sentOn: data.sentOn
        });

        if (data.replyTo) {
            validateObjectId(data.replyTo, 'Reply To Message ID');
            message.replyTo = data.replyTo;
        }

        if (data.type === 'text') {
            validateString(data.content, 'Message content');
            message.content = data.content;
        } else if (data.type === 'share contact') {
            validateString(data.content, 'Message content');
            message.content = data.content;
            message.sharedContact = data.sharedContact;
        } else {
            const media = new MediaModel({
                from: data.from,
                type: data.type,
                name: data.mediaName,
                url: data.mediaUrl,
                message: message._id,
                thumbnail: data.thumbnail
            });
            message.media.push(media);
        }

        // Initialize status for ALL members (including sender for comprehensive tracking)
        for (const member of data.members) {
            const userId = member.user._id.toString();
            
            const statusEntry = {
                user: member.user._id,
                sent: data.sentOn
            };

            // Sender's message is considered delivered immediately
            if (userId === data.from) {
                statusEntry.delivered = data.sentOn;
            }

            message.status.push(statusEntry);
        }

        return message;
    }

    /**
     * Create a generic message object (e.g., when new member is added to group)
     */
    createGeneric(title, chatId, from) {
        validateRequired(title, 'Title');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(from, 'From user ID');

        const message = new this.model({
            content: title,
            chatId: chatId,
            from: from,
            kind: 'generic',
            sentOn: Date.now(),
            status: []
        });

        return message;
    }

    /**
     * Save message to database with optional population
     * @param {Object} message - Message object to save
     * @param {boolean} shouldPopulateFrom - Whether to populate from field
     * @param {Object} session - MongoDB session for transactions
     */
    async save(message, shouldPopulateFrom = true, session = null) {
        if (!message) {
            throw new Error('Message object is required');
        }

        try {
            if (['image', 'video', 'audio', 'document'].includes(message.kind)) {
                const mediaExists = await MediaModel.countDocuments({ message: message._id }).exec();

                if (mediaExists === 0 && message.media && message.media.length > 0) {
                    try {
                        if (session) {
                            await MediaModel.create(message.media, { session });
                        } else {
                            await MediaModel.create(message.media);
                        }
                    } catch (ex) {
                        console.error(`Error while saving media: ${ex.message}`);
                    }
                }
            }

            if (session) {
                await message.save({ session });
            } else {
                await message.save();
            }

            if (shouldPopulateFrom) {
                await message.populate([
                    {
                        path: 'replyTo',
                        select: '-isImported -importedOn -summary -replyTo -__v -uniqueId',
                        populate: {
                            path: 'media reactions status from status.user',
                            select: '_id id name email phone imageUrl status kind date from thumbnail url type',
                            populate: {
                                path: 'from',
                                select: utils.userColumnsToShow()
                            }
                        }
                    },
                    {
                        path: 'status.user',
                        select: utils.userColumnsToShow()
                    },
                    {
                        path: 'media',
                        select: utils.mediaColumnsToShow(),
                        populate: {
                            path: 'from',
                            select: utils.userColumnsToShow()
                        }
                    },
                    {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                ]);
            }

            return {
                title: 'Message is saved',
                message: message
            };
        } catch (ex) {
            console.error(`Error occurred while saving message: ${ex.message}`);
            throw ex;
        }
    }

    /**
     * Save message and mark as delivered for recipients in a single transaction
     * @param {Object} message - Message object to save
     * @param {Array<string>} deliverToUsers - User IDs to mark as delivered
     * @returns {Promise<Object>} - Saved message with delivery status
     */
    async saveAndMarkDelivered(message, deliverToUsers = []) {
        if (!message) {
            throw new Error('Message object is required');
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Save message
            await this.save(message, true, session);

            // Mark as delivered for specified users
            if (deliverToUsers && deliverToUsers.length > 0) {
                const filter = {
                    _id: message._id,
                    'status.user': { $in: deliverToUsers }
                };

                const update = {
                    $set: {
                        'status.$[elem].delivered': Date.now()
                    }
                };

                const options = {
                    arrayFilters: [
                        {
                            'elem.user': { $in: deliverToUsers },
                            'elem.delivered': null
                        }
                    ],
                    session: session
                };

                await this.model.updateMany(filter, update, options);
                console.log(`Message saved with delivery confirmation for ${deliverToUsers.length} users`);
            }

            await session.commitTransaction();

            return {
                title: 'Message saved with delivery status',
                message: message
            };
        } catch (error) {
            await session.abortTransaction();
            console.error(`Transaction failed: ${error.message}`);
            throw error;
        } finally {
            await session.endSession();
        }
    }

    /**
     * Mark message as delivered for specific users
     */
    async messageDelivered(users, messageId, date) {
        validateRequired(messageId, 'Message ID');
        validateObjectId(messageId, 'Message ID');
        validateRequired(date, 'Date');

        if (typeof users === 'number') {
            users = await normalizeUserId(users);
        }

        if (typeof users === 'string') {
            users = [users];
        }

        if (!Array.isArray(users)) {
            throw new Error('Users must be an array, string, or number');
        }

        const filter = { _id: messageId, 'status.user': { $in: users } };
        const update = { $set: { 'status.$.delivered': new Date(date) } };

        const editedMessage = await this.model
            .findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .lean();

        if (!editedMessage) {
            throw new Error('User is not part of the chat');
        }

        return editedMessage;
    }

    /**
     * Set message status to sent for multiple users
     */
    async setMessageSentTo(users, message) {
        if (!Array.isArray(users)) {
            throw new Error('Users must be an array');
        }
        if (!message) {
            throw new Error('Message object is required');
        }

        for (const to of users) {
            const sent = {
                user: to,
                sent: message.sentOn
            };
            message.status.push(sent);
        }

        try {
            await message.save();
            console.log('Message is updated with SentTo');
        } catch (err) {
            console.error('Message is not updated with SentTo:', err.message);
            throw err;
        }
    }

    /**
     * Mark message as read/seen by user
     */
    async messageSeen(byUser, messageId, date) {
        validateRequired(byUser, 'User ID');
        validateRequired(messageId, 'Message ID');
        validateObjectId(messageId, 'Message ID');
        validateRequired(date, 'Date');

        const filter = { _id: messageId, 'status.user': { $eq: byUser } };
        const update = { $set: { 'status.$.read': new Date(date * 1000) } };

        const editedMessage = await this.model
            .findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .lean();

        if (!editedMessage) {
            throw new Error('User is not part of the chat');
        }

        return editedMessage;
    }

    /**
     * Delete a message (for myself or for everyone)
     */
    async deleteMessage(messageId, from, forEveryone) {
        validateObjectId(messageId, 'Message ID');
        validateRequired(from, 'From user ID');

        const message = await this.model.findById(messageId);

        if (!message) {
            throw new Error('Message not found');
        }

        if (!message.deleted) {
            message.deleted = {
                forMyself: null,
                forEveryone: null,
                by: null,
                from: null,
                date: null
            };
        }

        if (forEveryone) {
            message.deleted.forEveryone = true;
            if (message.deleted.forMyself) {
                message.deleted.forMyself = false;
            }
        } else {
            if (message.deleted.forEveryone) {
                message.deleted.forEveryone = false;
            }
            message.deleted.forMyself = true;
        }

        message.deleted.by = from;
        message.deleted.date = Date.now();

        await message.save();

        return {
            title: 'Message marked as deleted',
            message: message
        };
    }

    /**
     * React to a message with emoji
     */
    async reactOnMessage(messageId, kind, from, date) {
        validateObjectId(messageId, 'Message ID');
        validateString(kind, 'Reaction kind');
        validateRequired(from, 'From user ID');
        validateRequired(date, 'Date');

        const message = await this.getById(messageId);
        const newDate = new Date(date * 1000);

        const reactExists = await Reaction.findOne({ from: from, message: messageId })
            .populate({
                path: 'from',
                select: utils.userColumnsToShow()
            });

        const userService = new UserService();
        const userFrom = await userService.getUserById(from, true);

        let reaction;

        if (reactExists) {
            reactExists.kind = kind;
            reactExists.date = newDate;
            reactExists.editedOn = newDate;
            await reactExists.save();

            const reactionIndex = message.reactions.findIndex(
                react => react._id.toString() === reactExists._id.toString()
            );
            message.reactions[reactionIndex] = reactExists;
            reaction = reactExists.toObject();
        } else {
            const rct = new Reaction({
                from: from,
                kind: kind,
                message: messageId,
                date: newDate,
                chatId: message.chatId
            });

            reaction = rct.toObject();
            const react = await rct.save();
            message.reactions.push(react);
        }

        reaction.from = userFrom;

        await message.save();

        return {
            reaction: reaction,
            message: message.toObject(),
            title: 'Reaction saved for message'
        };
    }

    /**
     * Get messages for a chat (with pagination)
     * @deprecated Use getMessages() instead
     */
    async getMessagesForChat(chatId, userId, skip = -1, callback) {
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const member = await this.chatService.getChatMember(chatId, userId);

        console.log(`Date joined: ${member.joinedOn}`);

        const query = {
            'deleted.date': { $eq: null },
            chatId: chatId,
            sentOn: { $gte: member.joinedOn }
        };

        const options = skip === -1
            ? {
                sort: { sentOn: -1 },
                select: utils.messageColumnsToShow(),
                lean: true,
                offset: 0,
                page: 0,
                populate: [
                    {
                        path: 'from status.user',
                        select: utils.userColumnsToShow()
                    },
                    {
                        path: 'replyTo media',
                        select: utils.replyMessageColumnsToShow() + utils.mediaColumnsToShow()
                    }
                ]
            }
            : {
                sort: { sentOn: -1 },
                select: utils.messageColumnsToShow(),
                lean: true,
                offset: skip,
                limit: 50,
                populate: [
                    {
                        path: 'from status.user',
                        select: utils.userColumnsToShow()
                    },
                    {
                        path: 'replyTo media',
                        select: utils.replyMessageColumnsToShow() + utils.mediaColumnsToShow()
                    }
                ]
            };

        const messages = await this.model.paginate(query, options);

        console.log(`Total messages: ${messages.length}`);

        if (messages.length > 0) {
            const messageOwners = messages
                .map(m => m.from._id.toString())
                .filter(fromUser => fromUser !== userId);

            const uniqueSenders = [...new Set(messageOwners)];

            const updateQuery = {
                chatId: chatId,
                from: { $ne: new ObjectId(userId) },
                status: {
                    $elemMatch: {
                        user: { $eq: new ObjectId(userId) }
                    }
                }
            };
            const update = { $set: { 'status.$[elem].read': Date.now() } };
            const filter = { arrayFilters: [{ 'elem.read': { $eq: null } }] };

            const result = await this.model.updateMany(updateQuery, update, filter);

            if (result.nModified > 0) {
                console.log(`Messages marked as read, Total: ${result.nModified}`);
                callback(true, uniqueSenders, chatId, userId);
            } else {
                console.log('Nothing to update for conversation');
                callback(false, uniqueSenders, chatId, userId);
            }
        }

        return { messages: messages };
    }

    /**
     * Get chat messages with pagination and filtering
     */
    async getMessages(chatId, userId, toMessageDate = null, howMany = -1, startValue, isInitial, callback) {
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const member = await this.chatService.getChatMember(chatId, userId);

        console.log(`toMessageDate: ${toMessageDate}`);

        let query = {
            'deleted.date': { $eq: null },
            chatId: chatId,
            sentOn: { $gte: new Date(member.joinedOn) }
        };

        if (startValue) {
            query._id = { $lt: startValue };
        }

        if (toMessageDate) {
            const $and = isInitial
                ? [
                    { sentOn: { $gte: new Date(member.joinedOn) } },
                    { sentOn: { $gt: new Date(toMessageDate) } }
                ]
                : [
                    { sentOn: { $gte: new Date(member.joinedOn) } },
                    { sentOn: { $lte: new Date(toMessageDate) } }
                ];

            query.$and = $and;
        }

        const messages = await this.model
            .find(query)
            .select(utils.messageColumnsToShow())
            .populate([
                {
                    path: 'from',
                    select: utils.userColumnsToShow()
                },
                {
                    path: 'status.user',
                    select: utils.userColumnsToShow()
                },
                {
                    path: 'media',
                    select: utils.mediaColumnsToShow()
                },
                {
                    path: 'reactions',
                    select: utils.reactionColumnsToShow(),
                    populate: {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                },
                {
                    path: 'replyTo',
                    select: utils.replyMessageColumnsToShow(),
                    populate: {
                        path: 'media reactions from',
                        select: utils.reactionColumnsToShow() + utils.mediaColumnsToShow() + utils.userColumnsToShow(),
                        populate: {
                            path: 'from',
                            select: utils.userColumnsToShow()
                        }
                    }
                }
            ])
            .sort({ sentOn: -1 })
            .limit(howMany !== -1 ? howMany : 0)
            .lean();

        console.log(`Total messages: ${messages.length}`);

        if (messages.length > 0) {
            const messageOwners = messages
                .map(m => m.from._id.toString())
                .filter(fromUser => fromUser !== userId);

            const uniqueSenders = [...new Set(messageOwners)];

            const updateQuery = {
                chatId: chatId,
                from: { $ne: new ObjectId(userId) },
                status: {
                    $elemMatch: {
                        user: { $eq: new ObjectId(userId) }
                    }
                }
            };
            const update = { $set: { 'status.$[elem].read': Date.now() } };
            const filter = { arrayFilters: [{ 'elem.read': { $eq: null } }] };

            const result = await this.model.updateMany(updateQuery, update, filter);

            if (result.nModified > 0) {
                console.log(`Messages marked as read, Total: ${result.nModified}`);
                callback(true, uniqueSenders, chatId, userId);
            } else {
                console.log('No messages marked as read for conversation');
                callback(false, uniqueSenders, chatId, userId);
            }
        }

        return { messages: messages };
    }

    /**
     * Get message by ID with full population
     */
    async getById(id) {
        validateObjectId(id, 'Message ID');

        const message = await this.model.findById(id)
            .select('-isImported -importedOn -summary -__v -uniqueId')
            .populate([
                {
                    path: 'from',
                    select: utils.userColumnsToShow()
                },
                {
                    path: 'status.user',
                    select: utils.userColumnsToShow()
                },
                {
                    path: 'media',
                    select: utils.mediaColumnsToShow()
                },
                {
                    path: 'reactions',
                    select: utils.reactionColumnsToShow(),
                    populate: {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                },
                {
                    path: 'replyTo',
                    select: '-isImported -importedOn -summary -replyTo -__v -uniqueId',
                    populate: {
                        path: 'media reactions from',
                        select: '_id id name email phone imageUrl status kind date from thumbnail url type',
                        populate: {
                            path: 'from',
                            select: utils.userColumnsToShow()
                        }
                    }
                }
            ]);

        if (!message) {
            throw new Error('Message not found');
        }

        return message;
    }

    async getLastMessageForChat(chatId) {
        validateObjectId(chatId, 'Chat ID');
        return this.model.find({ chatId: chatId }).sort({ sentOn: -1 }).limit(1).exec();
    }

    async getFirstMessageForChat(chatId) {
        validateObjectId(chatId, 'Chat ID');
        return this.model.find({ chatId: chatId }).sort({ sentOn: 1 }).limit(1).exec();
    }

    async setMessageType(messageId, kind) {
        validateRequired(messageId, 'Message ID');
        validateString(kind, 'Message kind');

        try {
            const filter = { uniqueId: messageId };
            console.log(`Kind: ${kind}`);

            const message = await this.model.findOneAndUpdate(
                filter,
                { kind: kind },
                { new: true }
            );

            if (message) {
                console.log(`Message type set to: ${kind} for message: ${message._id}`);
                return true;
            }

            console.log(`Message not found with uniqueId: ${messageId}`);
            return false;

        } catch (err) {
            console.error(`Message type NOT set to: ${kind} for message: ${messageId} Error: ${err.message}`);
            return false;
        }
    }

    async getMessageWithoutStatus() {
        try {
            const filter = { status: [] };
            const messages = await this.model.find(filter);
            return messages;
        } catch (err) {
            console.error(`Error thrown while getting messages without status: ${err.message}`);
            throw err;
        }
    }

    /**
     * Mark all messages in a conversation as seen/read
     */
    async markConversationSeen(userId, chatId, date = null) {
        validateRequired(userId, 'User ID');
        validateObjectId(chatId, 'Chat ID');

        const query = {
            chatId: chatId,
            from: { $ne: new ObjectId(userId) },
            status: {
                $elemMatch: {
                    user: { $eq: new ObjectId(userId) }
                }
            }
        };

        const markDate = date || Date.now();
        const update = { $set: { 'status.$[elem].read': markDate } };
        const filter = { arrayFilters: [{ 'elem.read': { $eq: null } }] };

        const result = await this.model.updateMany(query, update, filter);

        console.log(`Conversation marked as seen, Total: ${result.nModified}`);

        return {
            status: 'unread messages',
            total: result.nModified
        };
    }

    async setMessageNotVisible(messageId) {
        validateObjectId(messageId, 'Message ID');

        const filter = { _id: messageId };
        const update = { $set: { visible: false } };

        const editedMessage = await this.model
            .findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .lean();

        if (!editedMessage) {
            throw new Error('No message found');
        }

        return editedMessage;
    }

    /**
     * Mark all undelivered messages as delivered for a user (for when they come back online)
     * @param {string} userId - User ID
     * @param {number} timestamp - Delivery timestamp (optional, defaults to now)
     * @returns {Promise<number>} - Number of messages marked as delivered
     */
    async markPendingMessagesAsDelivered(userId, timestamp = Date.now()) {
        validateRequired(userId, 'User ID');

        if (typeof userId === 'number') {
            userId = await normalizeUserId(userId);
        }

        const filter = {
            'status.user': new ObjectId(userId),
            'status.delivered': null
        };

        const update = {
            $set: {
                'status.$[elem].delivered': timestamp
            }
        };

        const options = {
            arrayFilters: [
                {
                    'elem.user': new ObjectId(userId),
                    'elem.delivered': null
                }
            ]
        };

        const result = await this.model.updateMany(filter, update, options);

        if (result.nModified > 0) {
            console.log(`Marked ${result.nModified} pending messages as delivered for user: ${userId}`);
        }

        return result.nModified;
    }
}

module.exports = MessageService;
