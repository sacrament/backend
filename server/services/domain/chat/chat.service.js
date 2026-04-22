const crypto = require('crypto');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const MessageModel = mongoose.model('Message');
const ChatModel = mongoose.model('Chat');

const UserService = require('../user/user.service');
const APIGateway = require('../../external/aws/api.gateway');

const utils = require('../../../utils/index');
const { normalizeUserId } = require('../../../utils/user.utils');
const { validateRequired, validateObjectId, validateString, validateBoolean } = require('../../../utils/validation.utils');

/**
 * ChatService - Manages chat operations, member management, and messaging
 * 
 * This service handles:
 * - Chat CRUD operations
 * - Member management (add, remove, permissions)
 * - Message tracking and unread counts
 * - Chat settings (favorites, muted, blocked)
 * 
 * @class ChatService
 */
class ChatService {
    constructor() {
        this.chatModel = ChatModel;
        this.userService = new UserService();
    }

    // ─── Helper Methods ──────────────────────────────────────────────────────────────

    /**
     * Build common populate options for member details
     * @private
     * @returns {Object} Populate configuration
     */
    #getMemberPopulateOpts() {
        return {
            path: "members.user",
            select: utils.userColumnsToShow()
        };
    }

    /**
     * Build common populate options for last message
     * @private
     * @returns {Object} Populate configuration
     */
    #getLastMessagePopulateOpts() {
        return {
            path: 'lastMessage',
            select: utils.lastMessageColumnsToShow(),
            populate: [
                {
                    path: 'from',
                    select: utils.userColumnsToShow()
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
                    path: 'media',
                    select: utils.mediaColumnsToShow(),
                    populate: {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                }
            ]
        };
    }

    /**
     * Build query to check user is member of chat
     * @private
     * @param {string} chatId - Chat ID
     * @param {string} userId - User ID (already normalized)
     * @returns {Object} MongoDB query
     */
    #getMembershipQuery(chatId, userId) {
        return {
            _id: chatId,
            members: {
                $elemMatch: {
                    $and: [
                        { user: { $eq: new ObjectId(userId) } },
                        { user: { $exists: true } }
                    ],
                    canChat: true,
                }
            }
        };
    }

    /**
     * Verify user is a member of chat
     * @private
     * @param {Object} chat - Chat document
     * @param {string} userId - User ID to check
     * @throws {Error} If user is not a member
     */
    #verifyMembership(chat, userId) {
        if (!chat) {
            throw new Error('Chat not found or user is not a member');
        }
    }

    // ─── Read Operations ─────────────────────────────────────────────────────────

    /**
     * Get chat by ID with full details including member and message information
     * @async
     * @param {string} chatId - Chat ID
     * @param {string|number} userId - User ID requesting the chat
     * @param {boolean} [populate=true] - Whether to populate referenced documents
     * @returns {Promise<Object>} Chat document with populated details
     * @throws {Error} If chat not found or user not a member
     */
    async getById(chatId, userId, populate = true) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const query = this.#getMembershipQuery(chatId, userId);

        if (populate) {
            let chat = await this.chatModel
                .findOne(query)
                .select(utils.chatColumnsToShow())
                .populate(this.#getMemberPopulateOpts())
                .populate(this.#getLastMessagePopulateOpts())
                .lean()
                .exec();

            this.#verifyMembership(chat, userId);

            try {
                chat = await this.updatePrivateChatMembersToActive(chatId);
            } catch (error) {
                console.warn(`[ChatService] Warning updating chat members to active: ${error.message}`);
            }

            try {
                const unreadCount = await this.countUnreadMessagesForChat(chatId, userId);
                chat.unreadMessages = unreadCount || 0;
            } catch (error) {
                console.warn(`[ChatService] Error fetching unread count for chat ${chatId}: ${error.message}`);
                chat.unreadMessages = 0;
            }

            return chat;
        } else {
            const chat = await this.chatModel.findOne(query).exec();
            this.#verifyMembership(chat, userId);
            return chat;
        }
    }

    async getAll(userId, skip = -1) {
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        // ─── Validate and sanitize skip parameter ─────────────────────────────────────
        skip = parseInt(skip, 10);
        if (isNaN(skip) || skip < 0) {
            skip = -1;
        }

        console.log(`Get All chats for: ${userId} at ${Date.now()}`);

        const userObjectId = new ObjectId(userId);

        const aggregate = this.chatModel.aggregate([
            // ─── Filter chats where user is a member with chat access ───────────────────
            {
                $match: {
                    members: {
                        $elemMatch: {
                            user: userObjectId,
                            canChat: true,
                        }
                    }
                }
            },

            // ─── Lookup message sender details ────────────────────────────────────────────
            {
                $lookup: {
                    from: 'messages',
                    let: { msgId: '$lastMessage' },
                    pipeline: [
                        { $match: { $expr: { $and: [
                            { $ne: ['$$msgId', null] },
                            { $eq: ['$_id', '$$msgId'] }
                        ] } } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'from',
                                foreignField: '_id',
                                as: 'from'
                            }
                        },
                        { $unwind: { path: '$from', preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                content: 1,
                                kind: 1,
                                sentOn: 1,
                                deleted: 1,
                                chatId: 1,
                                from: {
                                    _id: 1,
                                    id: 1,
                                    name: 1,
                                    email: 1,
                                    phone: 1,
                                    imageUrl: 1
                                },
                                reactions: 1,
                                media: 1,
                                replyTo: 1,
                                status: 1,
                                encrypted: 1
                            }
                        }
                    ],
                    as: 'lastMessage'
                }
            },

            {
                $unwind: {
                    path: '$lastMessage',
                    preserveNullAndEmptyArrays: true
                }
            },

            // ─── Lookup all member details ────────────────────────────────────────────────
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.user',
                    foreignField: '_id',
                    as: 'memberDetails'
                }
            },

            // ─── Reconstruct members with user details ─────────────────────────────────────
            {
                $addFields: {
                    members: {
                        $map: {
                            input: '$members',
                            as: 'member',
                            in: {
                                _id: '$$member._id',
                                user: {
                                    $let: {
                                        vars: {
                                            userObj: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: '$memberDetails',
                                                            as: 'detail',
                                                            cond: { $eq: ['$$detail._id', '$$member.user'] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: {
                                            _id: '$$userObj._id',
                                            name: '$$userObj.name',
                                            email: '$$userObj.email',
                                            phone: '$$userObj.phone',
                                            imageUrl: '$$userObj.imageUrl',
                                            device: '$$userObj.device'
                                        }
                                    }
                                },
                                joinedOn: '$$member.joinedOn',
                                canChat: '$$member.canChat',
                                options: '$$member.options'
                            }
                        }
                    }
                }
            },

            // ─── Project final shape ──────────────────────────────────────────────────────
            {
                $project: {
                    _id: 1,
                    active: 1,
                    createdOn: 1,
                    lastMessage: { $ifNull: ['$lastMessage', null] },
                    members: 1,
                    uniqueId: 1
                }
            },

            // ─── Sort by last message timestamp ────────────────────────────────────────────
            {
                $sort: {
                    'lastMessage.sentOn': -1,
                    '_id': -1
                }
            }
        ]);

        try {
            let chats;

            if (skip !== -1) {
                chats = await aggregate.skip(skip).limit(20).exec();
            } else {
                chats = await aggregate.exec();
            }

            // ─── Fetch unread message counts efficiently ────────────────────────────────
            await Promise.all(chats.map(async (chat) => {
                const unread = await this.countUnreadMessagesForChat(chat._id.toString(), userId);
                chat.unreadMessages = unread;
            }));

            console.log(`Total chats fetched: ${chats.length} at ${Date.now()}`);
            return chats;
        } catch (ex) {
            console.error(`[ChatService.getAll] Error fetching chats for user ${userId}: ${ex.message}`);
            throw ex;
        }
    }

    async getChatsForUser(user, showOnlyFavorites = false, skip = 0) {
        validateRequired(user, 'User ID');
        validateBoolean(showOnlyFavorites, 'Show only favorites');

        if (showOnlyFavorites) {
            return this.getAllFavoriteChats(user);
        } else {
            return this.getAll(user, skip);
        }
    }

    async getChatMembers(chatId, onlyUser = true) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateBoolean(onlyUser, 'Only user');

        const query = {
            active: true,
            _id: chatId
        };

        const chat = await this.chatModel.findOne(query).lean().exec();

        if (!chat) {
            throw new Error('Chat not found');
        }

        if (onlyUser) {
            return chat.members.map(member => member.user);
        } else {
            return chat.members.map(member => member);
        }
    }

    /**
     * Get a specific member from a chat
     * @async
     * @param {string} chatId - Chat ID
     * @param {string|number} userId - User ID to find
     * @returns {Promise<Object>} Member document
     * @throws {Error} If member not found
     */
    async getChatMember(chatId, userId) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const query = {
            active: true,
            _id: chatId,
            members: {
                $elemMatch: {
                    user: new ObjectId(userId),
                    canChat: true,
                }
            }
        };

        const chat = await this.chatModel.findOne(query).lean().exec();

        if (!chat) {
            throw new Error(`User ${userId} is not an active member of this chat`);
        }

        const member = chat.members.find(m => m.user.toString() === userId);
        
        if (!member) {
            throw new Error(`Member not found in chat`);
        }

        return member;
    }

    async countUnreadMessagesForChat(chatId, userId) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        try {
            // For private chats, count messages not from this user that haven't been read
            const count = await MessageModel.countDocuments({
                chatId: { $eq: new ObjectId(chatId) },
                from: { $ne: new ObjectId(userId) },
                kind: { $ne: 'generic' },
                'deleted.date': { $eq: null },
                'status.read': { $eq: null }
            }).exec();

            return count;
        } catch (err) {
            console.error(`Error counting unread messages for chat ${chatId}: ${err.message}`);
            return 0;
        }
    }

    async countUnreadMessagesForUser(userId) {
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        const aggregate = this.chatModel.aggregate([
            {
                $match: {
                    active: true,
                    members: {
                        $elemMatch: {
                            $and: [{ user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } }],
                            canChat: true,
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'messages',
                    let: {
                        chatId: '$_id'
                    },
                    pipeline: [{
                        $match: {
                            $expr: {
                                $and: [{
                                    $ne: [
                                        '$from', new ObjectId(userId)
                                    ]
                                }, {
                                    $eq: [
                                        '$chatId', '$$chatId'
                                    ]
                                }, {
                                    $eq: [
                                        '$deleted.date', null
                                    ]
                                }, {
                                    $eq: [
                                        '$status.read', null
                                    ]
                                }]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: "$_id"
                        }
                    }
                    ],
                    as: 'unreadMessages'
                }
            },
            {
                $addFields: {
                    unreadMessages: {
                        $size: '$unreadMessages'
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$unreadMessages"
                    }
                }
            },
            {
                $project: {
                    total: {
                        _id: 0
                    }
                }
            }
        ]);

        try {
            const result = await aggregate.exec();
            if (result.length > 0) {
                console.log(`Total Unread messages: ${result[0].total} at ${Date.now()}`);
                return result[0].total;
            } else {
                return 0;
            }
        } catch (ex) {
            console.error('Error: ' + ex.message);
            return 0;
        }
    }

    async countTotalUnreadChatsForUser(userId) {
        validateRequired(userId, 'User ID');

        userId = await normalizeUserId(userId);

        try {
            const result = await this.chatModel.aggregate([
                {
                    '$match': {
                        'active': true,
                        'members': {
                            '$elemMatch': {
                                'user': new ObjectId(userId),
                                'canChat': true,
                            }
                        }
                    }
                }, {
                    '$lookup': {
                        'from': 'messages',
                        'let': {
                            'chatId': '$_id'
                        },
                        'pipeline': [
                            {
                                '$match': {
                                    '$expr': {
                                        '$and': [
                                            {
                                                '$ne': [
                                                    '$from', new ObjectId(userId)
                                                ]
                                            }, {
                                                '$eq': [
                                                    '$chatId', '$$chatId'
                                                ]
                                            },
                                            {
                                                $eq: [
                                                    '$deleted.date', null
                                                ]
                                            }
                                        ]
                                    }
                                }
                            }, {
                                '$unwind': {
                                    'path': '$status',
                                    'preserveNullAndEmptyArrays': false
                                }
                            }, {
                                '$match': {
                                    'status.read': {
                                        '$eq': null
                                    }
                                }
                            }, {
                                '$group': {
                                    '_id': '$_id'
                                }
                            }
                        ],
                        'as': 'unreadMessages'
                    }
                }, {
                    '$addFields': {
                        'unreadMessages': {
                            '$size': '$unreadMessages'
                        }
                    }
                }, {
                    '$match': {
                        'unreadMessages': {
                            '$gt': 0
                        }
                    }
                }, {
                    '$count': 'total'
                }
            ]).exec();

            if (result.length) {
                const total = result[0].total;
                console.log(`Total Unread: ${JSON.stringify(total)} for user: ${userId}`);
                return total;
            } else {
                console.log(`No Unread Chats`);
                return 0;
            }
        } catch (err) {
            console.error(`Error counting chats for user: ${userId}. Error: ${err.message}`);
            return 0;
        }
    }

    async getByUniqueId(uniqueId) {
        validateRequired(uniqueId, 'Unique ID');
        validateString(uniqueId, 'Unique ID');

        const query = {
            isImported: true,
            uniqueId: uniqueId
        };

        try {
            const chat = await this.chatModel.findOne(query).lean().exec();

            if (!chat) {
                throw new Error(`Chat not found: ${uniqueId}`);
            }

            return chat;
        } catch (err) {
            console.log(`Error while getting chat with unique: ${uniqueId}`);
            throw err;
        }
    }

    async getChatById(chatId) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');

        const query = {
            _id: chatId
        };

        const chat = await this.chatModel
            .findOne(query)
            .select(utils.chatColumnsToShow())
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from reactions',
                    select: utils.userColumnsToShow() + utils.reactionColumnsToShow(),
                    populate: {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                }
            })
            .lean()
            .exec();

        if (!chat) {
            throw new Error('No chat found for given id');
        }

        if (!chat.active) {
            throw new Error('Chat is not active');
        }

        return chat;
    }

    async getOnlyChat(id) {
        validateRequired(id, 'Chat ID');
        validateObjectId(id, 'Chat ID');

        const query = {
            _id: id
        };

        const chat = await this.chatModel
            .findOne(query)
            .select(utils.chatColumnsToShow())
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .exec();

        if (!chat) {
            throw new Error('No chat found for given id');
        }

        return chat;
    }

    async updatePrivateChatMembersToActive(chatId) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');

        const date = Date.now();
        const filter = { _id: chatId, 'members.canChat': { $eq: false } };
        const update = { $set: { 'members.$.canChat': true, 'members.$.joinedOn': date, 'members.$.updatedOn': date } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update, { new: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) {
            throw new Error('Nothing to update');
        }

        return chat;
    }

    async updateChatWithPublicKey(data) {
        validateRequired(data, 'Data');
        validateRequired(data.chatId, 'Chat ID');
        validateObjectId(data.chatId, 'Chat ID');
        validateRequired(data.publicKey, 'Public key');
        validateString(data.publicKey, 'Public key');

        const query = { _id: data.chatId };
        const update = { $set: { 'publicKey': data.publicKey } };

        const chat = await this.chatModel.findOneAndUpdate(query, update).lean().exec();

        if (!chat) {
            throw new Error('Nothing to update for chat');
        }

        return chat;
    }

    // ─── Write / Mutation Operations ─────────────────────────────────────────────

    /**
     * Create a new chat or reactivate existing chat between members
     * @async
     * @param {Object} data - Chat creation data
     * @param {Object} data.chat - Chat details
     * @param {Array<string|number>} data.chat.users - User IDs to add to chat (includes all members)
     * @returns {Promise<Object>} Response with message and chat document
     * @throws {Error} If validation fails or database error occurs
     */
    async create(data) {
        validateRequired(data, 'Chat data');
        validateRequired(data.chat, 'Chat details');
        validateRequired(data.chat.users, 'Chat users');

        try {
            // Get member IDs (contains all users)
            const memberIds = await this.userService.getUserIds(data.chat.users);

            // Derive a deterministic uniqueId from sorted member IDs
            const uniqueId = this.#computeChatUniqueId(memberIds);

            // Check for existing chat by uniqueId (fast indexed lookup)
            const existingChat = await this.#findChatByUniqueId(uniqueId);

            if (existingChat) {
                return this.#reactivateExistingChat(existingChat);
            }

            // Create new chat
            return await this.#createNewChat(memberIds, uniqueId);
        } catch (error) {
            console.error(`[ChatService] Error creating chat: ${error.message}`);
            throw error;
        }
    }

    /**
     * Compute a deterministic uniqueId from member IDs
     * @private
     * @param {Array<string>} memberIds - Member MongoDB ObjectId strings
     * @returns {string} SHA-256 hex digest of sorted IDs
     */
    #computeChatUniqueId(memberIds) {
        const sorted = [...memberIds].map(id => id.toString()).sort();
        return crypto.createHash('sha256').update(sorted.join(':')).digest('hex');
    }

    /**
     * Find existing chat by uniqueId
     * @private
     * @param {string} uniqueId - Precomputed chat uniqueId
     * @returns {Promise<Object|null>} Existing chat or null
     */
    async #findChatByUniqueId(uniqueId) {
        return await this.chatModel
            .findOne({ uniqueId })
            .populate(this.#getMemberPopulateOpts())
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .exec();
    }

    /**
     * Reactivate an existing chat
     * @private
     * @param {Object} chat - Existing chat document
     * @returns {Object} Response with reactivated chat
     */
    #reactivateExistingChat(chat) {
        chat.active = true;

        // Reactivate all members in the chat
        for (const member of chat.members) {
            member.canChat = true;
            member.options = member.options || {};
            member.options.blocked = false;
            member.updatedOn = Date.now();
            member.joinedOn = Date.now();
            member.leftOn = null;
        }

        chat.save();

        return {
            message: 'Chat reactivated',
            chat: chat,
            isNew: false
        };
    }

    /**
     * Create a brand new chat
     * @private
     * @param {string|Array} memberIds - Member IDs to add
     * @returns {Promise<Object>} Response with newly created chat
     */
    async #createNewChat(memberIds, uniqueId) {
        const chat = new this.chatModel();
        chat.uniqueId = uniqueId;

        for (const memberId of memberIds) {
            chat.members.push({ user: memberId });
        }

        await chat.save();

        const newChat = await this.getOnlyChat(chat._id.toString());

        return {
            message: 'Chat created successfully',
            chat: newChat,
            isNew: true
        };
    }

    /**
     * Save a chat document
     * @async
     * @param {Object} chat - Chat document to save
     * @returns {Promise<Object>} Response with saved chat
     * @throws {Error} If chat is invalid
     */
    async save(chat) {
        validateRequired(chat, 'Chat document');

        await chat.save();
        await chat.populate(this.#getMemberPopulateOpts());

        console.log(`[ChatService] Chat ${chat._id} saved successfully`);
        return {
            message: "Chat saved successfully",
            chat: chat
        };
    }

    /**
     * Edit chat details (no editable properties for private chats)
     * @async
     * @param {Object} data - Chat update data (currently no fields editable for private chats)
     * @param {string} data.id - Chat ID
     * @returns {Promise<Object>} Response with chat
     * @throws {Error} No updates available for private chats
     */
    async edit(data) {
        validateRequired(data, 'Update data');
        validateRequired(data.id, 'Chat ID');
        validateObjectId(data.id, 'Chat ID');

        // Private chats have no editable properties (name/imageUrl derived from members)
        throw new Error('Private chats cannot be edited - properties are derived from members');

    }

    async newMembers(chatId, users, fromUser) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(users, 'Users');

        const userObjectIds = users.map(user => new ObjectId(user));
        const q = {
            _id: chatId,
            'members.user': { $in: userObjectIds }
        };

        const foundChat = await this.chatModel.findOne(q)
            .populate(this.#getMemberPopulateOpts())
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            }).exec();

        if (foundChat) {
            console.log(`[ChatService] Members already exist in chat ${chatId}`);
            return { chat: foundChat, exists: true };
        }

        const mapUsers = users.map((member) => {
            return { user: member };
        });

        const query = { _id: chatId };
        const update = { $addToSet: { members: { $each: mapUsers } } };

        const chat = await this.chatModel.findOneAndUpdate(query, update, { new: true })
            .populate(this.#getMemberPopulateOpts())
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('Chat not found for given id');

        console.log(`[ChatService] Added ${users.length} members to chat ${chatId}`);
        return { chat: chat, exists: false };
    }

    async removeMembers(chatId, users) {
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');
        validateRequired(users, 'Users');

        const query = { _id: chatId };
        const update = { $pull: { members: { user: { $in: users.map(user => new ObjectId(user)) } } } };

        const chat = await this.chatModel.findOneAndUpdate(query, update, { new: true })
            .populate(this.#getMemberPopulateOpts())
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('Chat not found for given id');

        console.log(`[ChatService] Removed ${users.length} members from chat ${chatId}`);
        return chat;
    }

    async leaveChat(userId, chatId) {
        validateRequired(userId, 'User ID');
        validateRequired(chatId, 'Chat ID');
        validateObjectId(chatId, 'Chat ID');

        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $pull: { members: { user: { $eq: new ObjectId(userId) } } } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update, { new: true })
            .populate(this.#getMemberPopulateOpts())
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('User is not a member of this chat');

        console.log(`[ChatService] User ${userId} left chat ${chatId}`);
        return {
            message: "User left the chat",
            chat: chat
        };
    }

    async deleteChat(chatId, forUser) {
        const chat = await this.getOnlyChat(chatId);
        const date = Date.now();

        const filter = { 'members.user': forUser, _id: chatId };
        const noActiveMembers = chat.members.filter(member => member.canChat === true);
        const update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date } };

        const updatedChat = await this.chatModel.findOneAndUpdate(filter, update, { new: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!updatedChat) throw new Error('No chat found to be deleted');

        return {
            message: "Chat is marked deleted",
            chat: updatedChat
        };
    }

    async favoriteChat(userId, chatId, status) {
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.favorite': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('Not chat found');

        return {
            text: status ? "Added to favourites" : "Removed from favourites",
            favoriteStatus: status,
            chat: chat
        };
    }

    async muteChat(userId, chatId, status) {
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.muted': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('No chat found');

        return {
            text: status ? "Chat is muted" : "Chat is unmuted",
            muteStatus: status,
            chat: chat
        };
    }

    async blockChat(me, chatId, status, reason = "", description = "") {
        let userId = me.user || me;
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.blocked': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update)
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('No chat found');

        const chatMembers = chat.members.filter(m => m.user._id != userId);

        const userService = new UserService();
        await (status ? userService.blockUsers(chatMembers, userId, reason, description) : userService.unblockUsers(chatMembers, userId));

        const apiGateway = new APIGateway();
        const promises = chatMembers.map(async m => {
            const member = m.user;
            const res = status ? await apiGateway.blockUser(member.id, me.token) : await apiGateway.unblockUser(member.id, me.token);
            return res;
        });

        const result = await Promise.all(promises);
        console.log(`Result from API [${status ? 'BLOCK' : 'UNBLOCK'} user]: ${result}`);

        return {
            text: status ? "Chat is blocked" : "Chat is unblocked",
            blockStatus: status,
            chat: chat
        };
    }

    async setLatestMessage(chatId, messageId, userId = null) {
        const filter = { _id: chatId };

        const chat = await this.chatModel.findOneAndUpdate(filter, { lastMessage: messageId }, { new: true, runValidators: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate(this.#getLastMessagePopulateOpts())
            .lean()
            .exec();

        if (!chat) {
            console.log(`Last message with id: ${messageId} is NOT set for chat: ${chatId}. Error thrown`);
            throw new Error('No chat found');
        }

        if (userId) {
            console.log(`Last message with id: ${messageId} is set for chat: ${chatId}`);
            const totalUnread = await this.countUnreadMessagesForChat(chatId, userId);
            chat.unreadMessages = totalUnread;
        }

        return {
            message: "This chat is been set a last message",
            chat: chat
        };
    }

    async getAllImportedChats() {
        return await this.chatModel.find({ isImported: true }).exec();
    }

    async setCreatedDate(chatId, date) {
        const filter = { _id: chatId };

        const chat = await this.chatModel.findOneAndUpdate(filter, { createdOn: date }, { new: true, runValidators: true })
            .exec();

        if (!chat) throw new Error('No chat found');

        const update = { $set: { 'members.$[elem].joinedOn': date } };
        const filter1 = { arrayFilters: [{ "elem.joinedOn": { $gt: date } }] };

        await this.chatModel.updateMany(filter, update, filter1);

        return {
            message: "This chat is been set a last message",
            chat: chat
        };
    }

    async updateChatWithLastMessage(chatId) {
        try {
            const lm = await MessageModel.find({ chatId: new ObjectId(chatId), 'deleted.date': null }).sort({ sentOn: -1 }).limit(1);

            if (lm.length) {
                const last = lm[0];
                const result = await this.setLatestMessage(chatId, last._id);
                return result;
            } else {
                return await this.setLatestMessage(chatId, null);
            }
        } catch (ex) {
            throw ex;
        }
    }

    async clearChat(chatId, forUser) {
        const date = Date.now();

        const filter = { 'members.user': forUser, _id: chatId };
        const update = { $set: { 'members.$.canChat': true, 'members.$.leftOn': null, 'members.$.joinedOn': date, 'members.$.updatedOn': date } };

        const chat = await this.chatModel.findOneAndUpdate(filter, update, { new: true })
            .populate({
                path: "members.user",
                select: utils.userColumnsToShow()
            })
            .populate({
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                populate: {
                    path: 'from',
                    select: utils.userColumnsToShow()
                }
            })
            .lean()
            .exec();

        if (!chat) throw new Error('No chat found to be cleared');

        return {
            message: "Chat is marked cleared",
            chat: chat
        };
    }

    async deleteAllChatsForUser(userId) {
        const aggregate = this.chatModel.aggregate([
            {
                $match: {
                    members: {
                        $elemMatch: {
                            $and: [{ user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } }]
                        }
                    }
                }
            }
        ]);

        const chats = await aggregate.exec();
        console.log(`Total chats fetched: ${chats.length}`);

        const promises = chats.map(async chat => {
            const query = { chatId: chat._id, from: new ObjectId(userId) };

            const update = {
                "deleted.forMyself": true,
                "deleted.by": userId,
                "deleted.date": Date.now()
            };

            const messages = await MessageModel.updateMany(query, update, { new: true });
            console.log('total messages deleted: ' + messages.nModified);

            const deleteChat = await this.deleteChat(chat._id, userId);
            console.log('Chat deleted: ' + deleteChat);

            return chat;
        });

        const result = await Promise.all(promises);
        console.log('result: ' + result);
        return result;
    }

}

module.exports = ChatService;
