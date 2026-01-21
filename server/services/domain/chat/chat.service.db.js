const ChatService = require('./chat.service');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const UserService = require('../user/user.service');
const UserModel = mongoose.model('User');
const BlockUserModel = mongoose.model('BlockUser');
const MessageModel = mongoose.model('Message');

const APIGateway = require('../../external/aws/api.gateway');

const utils = require('../../../utils/index');
const { normalizeUserId } = require('../../../utils/user.utils');
const { validateRequired, validateObjectId, validateString, validateBoolean, validateArray } = require('../../../utils/validation.utils');

/**
 * Chat Service Database Operations
 *
 * @class ChatServiceDB
 * @extends {ChatService}
 */
class ChatServiceDB extends ChatService {
    /**
     * Create a new chat or return existing private chat
     *
     * @param {Object} data - Chat creation data
     * @param {string} data.userId - User creating the chat
     * @param {Object} data.chat - Chat configuration
     * @param {string} data.chat.type - Chat type (private/group)
     * @param {Array} data.chat.users - Users to add to chat
     * @returns {Promise<Object>} Created or existing chat
     * @memberof ChatServiceDB
     */
    async create(data) {
        let userId = await normalizeUserId(data.userId);

        try {
            const userService = new UserService(UserModel);
            const userIds = await userService.getUserIds(data.chat.users);

            const type = data.chat.type;
            if (type === 'private') {
                const mms = [userId, userIds];
                // Check if there's already chat
                const query = {
                    type: 'private',
                    'members.user': { $all : mms }
                };

                const chat = await this.model
                .findOne(query)
                .populate({
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    populate: {
                        path: 'from',
                        select: utils.userColumnsToShow()
                    }
                })
                .populate({
                    path: 'members.user',
                    select: utils.userColumnsToShow()
                }).exec();

                if (chat) {
                    chat.active = true;
                    chat.deleted = false;
                    chat.deletedOn = null;
                    chat.deletedBy = null;

                    if (chat.type === 'private') {
                        const noMembers = chat.members.filter(member => member.canChat === true);
                        if (noMembers.length === 0) {
                            const date = Date.now();
                            chat.updatedOn = date;
                            chat.createdOn = date;
                        }
                    }

                    // set members to active
                    for (const member of chat.members) {
                        if (member.user._id.toString() === userId) {
                            member.canChat = true;
                            member.options.blocked = false;
                            member.updatedOn = Date.now();
                            member.joinedOn = Date.now();
                            member.leftOn = null;
                        }
                    }

                    await chat.save();

                    return {
                        message: "There is an existing Chat already",
                        chat: chat
                    };
                }
            }

            const chat = new this.model;
            chat.type = data.chat.type;
            chat.name = data.chat.name;
            chat.uniqueId = chat._id;

            if (chat.type === 'group') {
                chat.imageUrl = data.chat.imageUrl || null;
            }

            chat.members.push({ user: userId, creator: true });

            if (typeof userIds === 'string') {
                const uo = { user: userIds };
                chat.members.push(uo);
            } else {
                for (const u of userIds) {
                    const uo = { user: u };
                    chat.members.push(uo);
                }
            }

            await chat.save();

            const newlyCreatedChat = await this.getOnlyChat(chat._id);
            return {
                message: "New chat saved",
                chat: newlyCreatedChat
            };
        } catch (ex) {
            throw ex;
        }
    }

    /**
     * Save a chat (NOT IN USE)
     *
     * @param {Object} chat - Chat document
     * @returns {Promise<Object>} Saved chat
     * @memberof ChatServiceDB
     */
    async save(chat) {
        if (!chat) throw new Error('No chat found');

        await chat.save();
        await chat.populate({
            path: 'members.user',
            select: utils.userColumnsToShow()
        });

        return {
            message: "Chat is saved",
            chat: chat
        };
    }

    /**
     * Edit chat name and/or image
     *
     * @param {Object} data - Edit data
     * @param {string} data.id - Chat ID
     * @param {string} [data.name] - New chat name
     * @param {string} [data.imageUrl] - New chat image URL
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async edit(data) {
        const query = {
            _id: data.id
        };

        const update = {};

        if (data.name) {
            update.name = data.name;
        }

        if (data.imageUrl) {
            update.imageUrl = data.imageUrl;
        }

        if (Object.keys(update).length === 0) {
            throw new Error('Nothing to update');
        }

        const chat = await this.model.findOneAndUpdate(query, update, { new: true, runValidators: true })
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

        if (!chat) throw new Error('No chat found for given id');

        return {
            message: "Chat is edited and saved",
            chat: chat
        };
    }

    /**
     * Add new members to the chat
     *
     * @param {string} chatId - Chat ID
     * @param {Array<string>} users - User IDs to add
     * @param {string} fromUser - User adding the members
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async newMembers(chatId, users, fromUser) {
        // Lookup current members with id's
        const q = {
            _id: chatId,
            'members.user': {$in: users.map(user => new ObjectId(user))}
        };

        const foundChat = await this.model.findOne(q)
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
        }).exec();

        if (foundChat) {
            console.log(`These users are already members the chat`);
            return { chat: foundChat, exists: true };
        }

        const mapUsers = users.map((member) => {
            return { user: member };
        });

        const query = { _id: chatId };
        const update = { $addToSet: { members: { $each: mapUsers } } };

        const chat = await this.model.findOneAndUpdate(query, update, { new: true })
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

        return { chat: chat, exists: false };
    }

    /**
     * Remove members from the chat
     *
     * @param {string} chatId - Chat ID
     * @param {Array<string>} users - User IDs to remove
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async removeMembers(chatId, users) {
        const query = { _id: chatId };
        const update = { $pull: { members: { user: { $in: users.map(user => new ObjectId(user)) } } } };

        const chat = await this.model.findOneAndUpdate(query, update, { new: true })
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

        return chat;
    }

    /**
     * Leave chat from a member
     *
     * @param {string} userId - User leaving the chat
     * @param {string} chatId - Chat ID
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async leaveChat(userId, chatId) {
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $pull: { members: { user: { $eq: new ObjectId(userId) } } } };

        const chat = await this.model.findOneAndUpdate(filter, update, { new: true })
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

        if (!chat) throw new Error('User is not member of the chat');

        return {
            title: "User is not part of the chat anymore",
            chat: chat
        };
    }

    /**
     * Delete chat only by creator/admin
     *
     * @param {string} chatId - Chat ID
     * @param {string} forUser - User deleting the chat
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async deleteChat(chatId, forUser) {
        const chat = await this.getOnlyChat(chatId);
        const date = Date.now();

        // Check the chat's type and then update accordingly; e.g chat group admin should delete the group. private chat just set the action taker to false
        let filter = { 'members.user': forUser, _id: chatId };
        let update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date } };

        if (chat.type === 'group') {
            filter = { _id: chatId };
            update = { $set: { active: false, deleted: true, deletedOn: Date.now(), deletedBy: forUser } };
        } else {
            const noMembers = chat.members.filter(member => member.canChat === true);
            if (noMembers.length === 1) {
                update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date, 'lastMessage': null } };
            }
        }

        const updatedChat = await this.model.findOneAndUpdate(filter, update, { new: true })
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

        if (!updatedChat) throw new Error('No chat group found to be deleted');

        return {
            message: "Chat group is marked deleted",
            chat: updatedChat
        };
    }

    /**
     * Favorite a chat
     *
     * @param {string} userId - User ID
     * @param {string} chatId - Chat ID
     * @param {boolean} status - Favorite status
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async favoriteChat(userId, chatId, status) {
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.favorite': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true })
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

    /**
     * Mute a chat
     *
     * @param {string} userId - User ID
     * @param {string} chatId - Chat ID
     * @param {boolean} status - Mute status
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async muteChat(userId, chatId, status) {
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.muted': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true })
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

    /**
     * Block chat conversation
     *
     * @param {string|Object} me - User ID or user object with token
     * @param {string} chatId - Chat ID
     * @param {boolean} status - Block status
     * @param {string} [reason=""] - Reason for blocking
     * @param {string} [description=""] - Description
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async blockChat(me, chatId, status, reason = "", description = "") {
        let userId = me.user || me;
        userId = await normalizeUserId(userId);

        const filter = { 'members.user': userId, _id: chatId };
        const update = { $set: { 'members.$.options.blocked': status, 'members.$.updatedOn': Date.now() } };

        const chat = await this.model.findOneAndUpdate(filter, update)
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

        // Get chat members (excluding current user)
        const chatMembers = chat.members.filter(m => m.user._id != userId);

        // Add blocked users to the table
        const userService = new UserService(BlockUserModel);
        await (status ? userService.blockUsers(chatMembers, userId, reason, description) : userService.unblockUsers(chatMembers, userId));

        // API Gateway calls
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

    /**
     * Set last message to a chat
     *
     * @param {string} chatId - Chat ID
     * @param {string} messageId - Message ID
     * @param {string} [userId=null] - User ID for unread count
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async setLatestMessage(chatId, messageId, userId = null) {
        const filter = { _id: chatId };

        const chat = await this.model.findOneAndUpdate(filter, { lastMessage: messageId }, { new: true, runValidators: true })
        .populate({
            path: "members.user",
            select: utils.userColumnsToShow()
        })
        .populate({
            path: 'lastMessage',
            select: utils.lastMessageColumnsToShow(),
            populate: {
                path: 'from media',
                select: utils.userColumnsToShow() + utils.mediaColumnsToShow()
            }
        })
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

    /**
     * Get all imported chats
     *
     * @returns {Promise<Array>} Imported chats
     * @memberof ChatServiceDB
     */
    async getAllImportedChats() {
        return await this.model.find({isImported: true}).exec();
    }

    /**
     * Set created date for a chat
     *
     * @param {string} chatId - Chat ID
     * @param {Date} date - Created date
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async setCreatedDate(chatId, date) {
        const filter = { _id: chatId };

        const chat = await this.model.findOneAndUpdate(filter, { createdOn: date }, { new: true, runValidators: true })
        .exec();

        if (!chat) throw new Error('No chat found');

        const update = { $set: { 'members.$[elem].joinedOn': date } };
        const filter1 = { arrayFilters: [ { "elem.joinedOn": { $gt: date } } ] };

        await this.model.updateMany(filter, update, filter1);

        return {
            message: "This chat is been set a last message",
            chat: chat
        };
    }

    /**
     * Update chat with last message. This action could be triggered when a chat message is deleted
     *
     * @param {string} chatId - Chat ID
     * @returns {Promise<Object>} Updated chat result
     * @memberof ChatService
     */
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

    /**
     * Clear a specific chat for user
     *
     * @param {string} chatId - Chat ID
     * @param {string} forUser - User ID
     * @returns {Promise<Object>} Updated chat
     * @memberof ChatServiceDB
     */
    async clearChat(chatId, forUser) {
        const date = Date.now();

        // Check the chat's type and then update accordingly; e.g chat group admin should delete the group. private chat just set the action taker to false
        const filter = { 'members.user': forUser, _id: chatId };
        const update = { $set: { 'members.$.canChat': true, 'members.$.joinedOn': date, 'members.$.updatedOn': date } };

        const chat = await this.model.findOneAndUpdate(filter, update, { new: true })
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

    /**
     * Delete all chats for user
     *
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Deleted chats
     * @memberof ChatService
     */
    async deleteAllChatsForUser(userId) {
        const aggregate = this.model.aggregate([
            {
                $match: {
                    members: {
                        $elemMatch: {
                            $and: [ { user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } } ]
                        }
                    }
                }
            }
        ]);

        const chats = await aggregate.exec();
        console.log(`Total chats fetched: ${chats.length}`);

        const promises = chats.map(async chat => {
            // Delete messages for chat
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

        // Wait for all to finish
        const result = await Promise.all(promises);
        console.log('result: ' + result);
        return result;
    }
}

module.exports = ChatServiceDB;
