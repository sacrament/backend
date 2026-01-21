const ChatService = require('./chat.service');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Reaction = mongoose.model('Reaction');

const ChatModel = mongoose.model('Chat');
const MediaModel = mongoose.model('Media');

const UserService = require('../user/user.service');
const UserModel = mongoose.model('User');
const utils = require('../../../utils/index');
const { normalizeUserId } = require('../../../utils/user.utils');
const { validateRequired, validateObjectId, validateString, validateEnum, validateFields } = require('../../../utils/validation.utils');

class MessageServiceDB extends ChatService {
    /**
     * Create a new Message object in memory (not saved to database)
     *
     * @param {Object} data - Message data
     * @param {string} data.tempId - Temporary message ID
     * @param {string} data.chatId - Chat ID
     * @param {string} data.from - Sender user ID
     * @param {string} data.type - Message type (text, image, video, audio, document, share contact)
     * @param {Date} data.sentOn - Message sent timestamp
     * @param {string} [data.content] - Message content (for text messages)
     * @param {Array} data.members - Chat members
     * @param {string} [data.replyTo] - ID of message being replied to
     * @returns {Object} Message object (not saved)
     */
    async create(data) {
        // Validate required fields
        validateFields(data, {
            tempId: { type: 'string', required: true },
            chatId: { type: 'objectId', required: true },
            from: { type: 'string', required: true },
            type: { type: 'string', required: true, enum: ['text', 'image', 'video', 'audio', 'document', 'share contact'] },
            sentOn: { type: 'date', required: true },
            members: { type: 'array', required: true, minLength: 1 }
        });

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
            // Media message (image, video, audio, document)
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

        // Set message status for all members
        for (const to of data.members) {
            if (to.user._id.toString() === data.from) continue;

            const sent = {
                user: to.user._id,
                sent: data.sentOn
            };
            message.status.push(sent);
        }

        return message;
    }

    /**
     * Create a generic message object (e.g., when new member is added to group)
     *
     * @param {string} title - Message content/title
     * @param {string} chatId - Chat ID
     * @param {string} from - Sender user ID
     * @returns {Object} Generic message object
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
     *
     * @param {Object} message - Message object to save
     * @param {boolean} [shouldPopulateFrom=true] - Whether to populate related fields
     * @returns {Promise<Object>} Saved message with title
     * @throws {Error} If save operation fails
     */
    async save(message, shouldPopulateFrom = true) {
        if (!message) {
            throw new Error('Message object is required');
        }

        try {
            // Save media if message contains media
            if (['image', 'video', 'audio', 'document'].includes(message.kind)) {
                const mediaExists = await MediaModel.countDocuments({ message: message._id }).exec();

                if (mediaExists === 0 && message.media && message.media.length > 0) {
                    try {
                        await MediaModel.create(message.media);
                    } catch (ex) {
                        console.error(`Error while saving media: ${ex.message}`);
                    }
                }
            }

            // Save the message
            await message.save();

            // Populate if requested
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

                return {
                    title: 'Message is saved',
                    message: message
                };
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
     * Mark message as delivered for specific users
     *
     * @param {Array<string>|string|number} users - User ID(s) to mark as delivered
     * @param {string} messageId - Message MongoDB ObjectId
     * @param {Date|number} date - Delivery timestamp
     * @returns {Promise<Object>} Updated message
     * @throws {Error} If message not found or user not part of chat
     */
    async messageDelivered(users, messageId, date) {
        validateRequired(messageId, 'Message ID');
        validateObjectId(messageId, 'Message ID');
        validateRequired(date, 'Date');

        // Normalize users to array of ObjectIds
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
     *
     * @param {Array<string>} users - Array of user IDs
     * @param {Object} message - Message object
     * @returns {Promise<void>}
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
     *
     * @param {string} byUser - User ID who read the message
     * @param {string} messageId - Message MongoDB ObjectId
     * @param {number} date - Unix timestamp (seconds)
     * @returns {Promise<Object>} Updated message
     * @throws {Error} If message not found or user not part of chat
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
     *
     * @param {string} messageId - Message MongoDB ObjectId
     * @param {string} from - User ID deleting the message
     * @param {boolean} forEveryone - True if deleting for everyone, false if only for self
     * @returns {Promise<Object>} Result with title and updated message
     * @throws {Error} If message not found
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
     *
     * @param {string} messageId - Message MongoDB ObjectId
     * @param {string} kind - Reaction type/emoji
     * @param {string} from - User ID reacting
     * @param {number} date - Unix timestamp (seconds)
     * @returns {Promise<Object>} Result with reaction, message, and title
     * @throws {Error} If message not found or operation fails
     */
    async reactOnMessage(messageId, kind, from, date) {
        validateObjectId(messageId, 'Message ID');
        validateString(kind, 'Reaction kind');
        validateRequired(from, 'From user ID');
        validateRequired(date, 'Date');

        const message = await this.getById(messageId);
        const newDate = new Date(date * 1000);

        // Check if reaction already exists
        const reactExists = await Reaction.findOne({ from: from, message: messageId })
            .populate({
                path: 'from',
                select: utils.userColumnsToShow()
            });

        const userService = new UserService(UserModel);
        const userFrom = await userService.getUserById(from, true);

        let reaction;

        if (reactExists) {
            // Update existing reaction
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
            // Create new reaction
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

        // Populate user from
        reaction.from = userFrom;

        // Update the message
        await message.save();

        return {
            reaction: reaction,
            message: message.toObject(),
            title: 'Reaction saved for message'
        };
    }

    /**
     * Get messages for a chat (with pagination)
     * NOT IN USE - deprecated method
     *
     * @deprecated Use getMessages() instead
     * @param {string} chatId - Chat MongoDB ObjectId
     * @param {string|number} userId - User ID
     * @param {number} [skip=-1] - Number of messages to skip
     * @param {Function} callback - Callback function
     * @returns {Promise<Object>} Messages and metadata
     */
    async getMessagesForChat(chatId, userId, skip = -1, callback) {
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const cs = new ChatService(ChatModel);
        const member = await cs.getChatMember(chatId, userId);

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
     *
     * @param {string} chatId - Chat MongoDB ObjectId
     * @param {string|number} userId - User ID
     * @param {Date|null} [toMessageDate=null] - Filter messages before/after this date
     * @param {number} [howMany=-1] - Limit number of messages (-1 for all)
     * @param {string} [startValue] - Start from this message ID
     * @param {boolean} [isInitial] - Whether this is initial load
     * @param {Function} callback - Callback for marking messages as read
     * @returns {Promise<Object>} Messages array
     * @throws {Error} If required parameters are missing
     */
    async getMessages(chatId, userId, toMessageDate = null, howMany = -1, startValue, isInitial, callback) {
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const cs = new ChatService(ChatModel);
        const member = await cs.getChatMember(chatId, userId);

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
     *
     * @param {string} id - Message MongoDB ObjectId
     * @returns {Promise<Object>} Populated message object
     * @throws {Error} If message not found
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

    /**
     * Get last message for a chat
     *
     * @param {string} chatId - Chat MongoDB ObjectId
     * @returns {Promise<Array<Object>>} Array with last message
     */
    async getLastMessageForChat(chatId) {
        validateObjectId(chatId, 'Chat ID');
        return this.model.find({ chatId: chatId }).sort({ sentOn: -1 }).limit(1).exec();
    }

    /**
     * Get first message for a chat
     *
     * @param {string} chatId - Chat MongoDB ObjectId
     * @returns {Promise<Array<Object>>} Array with first message
     */
    async getFirstMessageForChat(chatId) {
        validateObjectId(chatId, 'Chat ID');
        return this.model.find({ chatId: chatId }).sort({ sentOn: 1 }).limit(1).exec();
    }

    /**
     * Set message type/kind
     *
     * @param {string} messageId - Message unique ID
     * @param {string} kind - Message kind/type
     * @returns {Promise<boolean>} True if updated, false otherwise
     */
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

    /**
     * Get all messages without status array
     *
     * @returns {Promise<Array<Object>>} Messages without status
     */
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
     *
     * @param {string} userId - User ID marking messages as seen
     * @param {string} chatId - Chat MongoDB ObjectId
     * @param {Date|number|null} [date=null] - Optional date to mark (default: now)
     * @returns {Promise<Object>} Result with status and total modified count
     * @throws {Error} If update fails
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

    /**
     * Mark message as not visible
     *
     * @param {string} messageId - Message MongoDB ObjectId
     * @returns {Promise<Object>} Updated message
     * @throws {Error} If message not found
     */
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
}

module.exports = MessageServiceDB;
