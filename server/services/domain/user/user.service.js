const SMSService = require('../../external/twilio/sms.service');
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const ContentStorage = mongoose.model('ContentStorage');
const APIGateway = require('../../external/aws/api.gateway');

const UserRequestModel = require('../../../models/user.request').UserRequest;
const UserConnectStatus = require('../../../models/user.connect').UserConnectStatus;

const utils = require('../../../utils/index');
const _ = require('lodash');

class UserService {
    constructor() {
        this.model = UserModel;
    }

    /**
     * Helper method to convert user ID (integer) to MongoDB ObjectId
     *
     * @private
     * @param {number|string} userId - User ID to convert
     * @returns {Promise<string>} MongoDB ObjectId as string
     * @throws {Error} If user not found
     */
    async _convertToMongoId(userId) {
        if (typeof userId === 'number') {
            const user = await UserModel.findOne({ id: userId }).select('_id');
            if (!user) {
                throw new Error(`User not found with id: ${userId}`);
            }
            return user._id.toString();
        }
        return userId;
    }

    /**
     * Helper method to get user by integer ID
     *
     * @private
     * @param {number} userId - User integer ID
     * @returns {Promise<Object>} User object
     * @throws {Error} If user not found
     */
    async _getUserByIntId(userId) {
        const user = await UserModel.findOne({ id: userId })
            .select('_id id name email phone imageUrl status device');
        if (!user) {
            throw new Error(`User not found with id: ${userId}`);
        }
        return user;
    }

    /**
     * Create or update a user
     *
     * @param {Object} json - User data object
     * @param {number} json.id - User ID
     * @param {string} json.name - User name
     * @param {string} json.phone - User phone number
     * @param {string} json.email - User email
     * @param {string} json.imageUrl - User image URL
     * @param {string} json.bio - User bio
     * @param {Object} json.device - Device information
     * @param {boolean} json.isPublic - Public profile flag
     * @param {string} json.status - User status
     * @param {string} json.facebookId - Facebook ID
     * @returns {Promise<Object>} Result object with title and user
     * @throws {Error} If save operation fails
     */
    async newUser(json) {
        if (!json || !json.id) {
            throw new Error('User data with valid ID is required');
        }

        const user = new this.model({
            id: json.id,
            name: json.name,
            phone: json.phone,
            email: json.email,
            imageUrl: json.imageUrl,
            bio: json.bio,
            registeredOn: json.registeredOn,
            device: {
                token: json.device?.token,
                type: json.device?.type,
                description: json.device?.description || null
            },
            isPublic: json.isPublic,
            status: json.status,
            facebookId: json.facebookId
        });

        const exists = await this.model.findOne({ id: json.id });

        if (exists) {
            console.log(`Update user: ${exists._id} with id: ${json.id}`);

            exists.name = json.name;
            exists.imageUrl = json.imageUrl;
            exists.bio = json.bio;
            exists.updatedOn = Date.now();

            await exists.save();

            console.log(`Existing user updated at: ${new Date().toISOString()}`);

            return {
                title: 'Existing user is updated',
                user: exists
            };
        }

        await user.save();

        console.log(`New user registered at: ${new Date().toISOString()}`);

        return {
            title: 'New user is saved',
            user: user
        };
    }

    /**
     * Get chat by ID
     *
     * @deprecated This method is not implemented
     * @param {string} chatId - Chat ID
     * @returns {null}
     */
    getChatById(chatId) {
        return null;
    }

    /**
     * Get user by MongoDB ObjectId
     *
     * @param {string} userId - MongoDB ObjectId
     * @param {boolean} select - Whether to select specific fields only
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserById(userId, select = false) {
        const query = this.model.findOne({ _id: userId }).lean();

        if (select) {
            query.select('_id id name email phone imageUrl status device');
        }

        return await query.exec();
    }

    /**
     * Get user by integer ID
     *
     * @param {number} userId - User integer ID
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserByIntId(userId) {
        return await this.model.findOne({ id: userId })
            .select('_id id name email phone imageUrl status device')
            .lean();
    }

    /**
     * Get all users from database
     *
     * @deprecated This method appears incomplete
     * @returns {Promise<Array>} Array of users
     */
    getAllUsersFromMainDB() {
        return this.model.findAll({});
    }

    /**
     * Get MongoDB IDs from integer user IDs array
     *
     * @param {Array<number>} users - Array of user integer IDs
     * @returns {Promise<Array<string>|string>} Array of MongoDB IDs or single ID
     */
    async getUserIds(users) {
        if (!users || !Array.isArray(users)) {
            throw new Error('Users array is required');
        }

        const foundUsers = await this.model.find({ id: { $in: users } }).select('_id');

        if (!foundUsers || foundUsers.length === 0) {
            return [];
        }

        const userIds = foundUsers.map(user => user._id.toString());

        if (userIds.length === 1) {
            return userIds[0];
        }

        return userIds;
    }

    /**
     * Get users by MongoDB ObjectIds
     *
     * @param {Array<string>} userIds - Array of MongoDB ObjectIds
     * @returns {Promise<Array>} Array of user objects
     */
    async getUsersBy(userIds) {
        if (!userIds || !Array.isArray(userIds)) {
            throw new Error('User IDs array is required');
        }

        return await this.model.find({ _id: { $in: userIds } })
            .select(utils.userColumnsToShow())
            .lean();
    }

    /**
     * Match user integer IDs to MongoDB IDs
     *
     * @param {Array<number>} users - Array of user integer IDs
     * @returns {Promise<Array>} Array of objects with mongoId and id
     */
    async matchUserIds(users) {
        if (!users || !Array.isArray(users)) {
            throw new Error('Users array is required');
        }

        const foundUsers = await this.model.find({ id: { $in: users } }).select('_id id');

        return foundUsers.map(user => ({
            mongoId: user._id.toString(),
            id: user.id
        }));
    }

    /**
     * Update user's device token
     *
     * @param {number} userId - User integer ID
     * @param {string} deviceToken - Device token
     * @param {string} deviceType - Device type (ios, android, etc.)
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async updateDeviceToken(userId, deviceToken, deviceType) {
        console.log(`Update device token: ${deviceType}`);

        const filter = { id: userId };
        const update = {
            $set: {
                'device.token': deviceToken,
                'device.type': deviceType,
                updatedOn: Date.now()
            }
        };

        const user = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();

        if (!user) {
            throw new Error('No device found for user');
        }

        return user;
    }

    /**
     * Update VoIP device token
     *
     * @param {number} userId - User integer ID
     * @param {string} deviceToken - VoIP device token
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async updateVoipDeviceToken(userId, deviceToken) {
        console.log('Update device voip token');

        const filter = { id: userId };
        const date = Date.now();
        const update = {
            $set: {
                'device.voipToken': deviceToken,
                'device.updatedOn': date,
                updatedOn: date
            }
        };

        const user = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();

        if (!user) {
            throw new Error('VOIPTOKEN: No device found for user');
        }

        console.log('Device updated with voip token');
        return user;
    }

    /**
     * Verify users by phone numbers
     *
     * @param {Array<string>} phones - Array of phone numbers
     * @returns {Promise<Array>} Array of objects with user and hasAccount flag
     */
    async verifyUsersByPhone(phones) {
        console.log('Verify users by phone');

        if (!phones || !Array.isArray(phones)) {
            throw new Error('Phones array is required');
        }

        const phonesString = phones.join(' ');
        const query = { $text: { $search: phonesString } };

        const users = await this.model.find(query)
            .select('_id id name email phone imageUrl status')
            .lean();

        const result = phones.map(phone => {
            const user = users.find(u => u.phone === phone);
            return {
                user: user || phone,
                hasAccount: !!user
            };
        });

        return result;
    }

    /**
     * Send SMS to phone numbers
     *
     * @param {number} from - Sender user ID
     * @param {Array<string>} phones - Array of phone numbers
     * @returns {Promise<Object>} SMS service response
     */
    async sendSMS(from, phones) {
        const user = await this.getUserByIntId(from);
        console.log('Send users SMS');

        return SMSService.send(user, phones);
    }

    /**
     * Enable device for user after login
     *
     * @param {number} userId - User integer ID
     * @param {string} newDeviceToken - New device token
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async enableDeviceForUser(userId, newDeviceToken) {
        console.log(`Activate device for user: ${userId}`);

        const filter = { id: userId };
        const date = Date.now();
        const update = {
            $set: {
                'device.isActive': true,
                'device.token': newDeviceToken,
                'device.updatedOn': date,
                updatedOn: date
            }
        };

        const user = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();

        if (!user) {
            throw new Error('No device found for user');
        }

        return user;
    }

    /**
     * Disable user device
     *
     * @param {number} userId - User integer ID
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async disableUserDeviceFor(userId) {
        console.log(`Disable device for user: ${userId}`);

        const filter = { id: userId };
        const update = {
            $set: {
                'device.isActive': false,
                'device.token': null,
                updatedOn: Date.now()
            }
        };

        const user = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();

        if (!user) {
            throw new Error('No device found for user');
        }

        return user;
    }

    /**
     * Save refresh token for user
     *
     * @param {number} userId - User integer ID
     * @param {string} refreshToken - Refresh token
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async saveRefreshToken(userId, refreshToken) {
        console.log(`Save refresh token for user: ${userId}`);

        const filter = { id: userId };
        const date = Date.now();
        const update = {
            $set: {
                refreshToken: refreshToken,
                updatedOn: date
            }
        };

        const user = await this.model.findOneAndUpdate(filter, update, { new: true }).lean();

        if (!user) {
            throw new Error('No user found');
        }

        return user;
    }

    /**
     * Block multiple users
     *
     * @param {Array<Object>} users - Array of user objects to block
     * @param {string} from - Blocker user MongoDB ID
     * @param {string} reason - Reason for blocking
     * @param {string} description - Description
     * @returns {Promise<Array>} Array of block records
     */
    async blockUsers(users, from, reason, description) {
        console.log(`Block users: ${from}`);

        if (!users || !Array.isArray(users)) {
            throw new Error('Users array is required');
        }

        const promises = users.map(async (m) => {
            const member = m.user;
            const block = new this.model({
                blocker: from,
                blocked: member._id,
                blockedOriginalId: member.id,
                reason: reason || 'NO_REASON',
                description: description || 'Blocked via chat',
                status: 'ACTIVE'
            });

            return await block.save();
        });

        const result = await Promise.all(promises);
        console.log(`Result from [BLOCK users]: ${result.length} users blocked`);

        return result;
    }

    /**
     * Unblock multiple users
     *
     * @param {Array<Object>} users - Array of user objects to unblock
     * @param {string} from - Unblocker user MongoDB ID
     * @returns {Promise<Array>} Array of unblock results
     */
    async unblockUsers(users, from) {
        console.log(`Unblock users: ${from}`);

        if (!users || !Array.isArray(users)) {
            throw new Error('Users array is required');
        }

        const promises = users.map(async (m) => {
            const memberId = m.user._id;
            return await this.model.findOneAndRemove({ blocker: from, blocked: memberId });
        });

        const result = await Promise.all(promises);
        console.log(`Result from [UNBLOCK users]: ${result.length} users unblocked`);

        return result;
    }

    /**
     * Get all blocked users for a user
     *
     * @param {number|string} userId - User ID (integer or MongoDB ID)
     * @returns {Promise<Array>} Array of block records
     */
    async getAllBlockedUsers(userId) {
        if (typeof userId === 'number') {
            userId = await this._convertToMongoId(userId);
        }

        console.log(`Get all blocked users: ${userId}`);

        const query = {
            $or: [{ blocker: userId }, { blocked: userId }]
        };

        const users = await this.model.find(query)
            .populate({
                path: 'blocker blocked',
                select: '_id id name email phone imageUrl status'
            });

        console.log(`Result from [ALL BLOCKED users]: ${users.length}`);
        return users;
    }

    /**
     * Block a single user
     *
     * @param {number} userId - User ID to block
     * @param {Object} me - Current user object with userId and token
     * @param {string} reason - Reason for blocking
     * @param {string} description - Description
     * @returns {Promise<Object>} Result object with blocked flag and user
     */
    async blockUser(userId, me, reason, description) {
        try {
            const myId = await this._convertToMongoId(me.userId);
            const userIDString = await this._convertToMongoId(userId);

            const userBlocked = await this._getUserByIntId(userId);

            const blockExists = await this.model.findOne({
                blocker: myId,
                blocked: userIDString
            });

            if (blockExists) {
                console.log(`Block for user: ${userId} exists from blocker: ${me.userId}`);
            } else {
                console.log(`Block for user: ${userId} does not exist from blocker: ${me.userId}. Storing`);

                const block = new this.model({
                    blocker: myId,
                    blocked: userIDString,
                    blockedOriginalId: userId,
                    reason: reason || 'NO_REASON',
                    description: description || 'Misbehaving',
                    status: 'ACTIVE'
                });

                await block.save();
            }

            const apiGateway = new APIGateway();
            const res = await apiGateway.blockUser(userId, me.token);

            console.log(`Result from API [BLOCK user]: ${res}`);

            return { blocked: true, blockedUser: userBlocked };

        } catch (ex) {
            console.error(`Error while blocking a single user: ${userId}: ERROR: ${ex.message}`);
            throw new Error(`Failed to block user: ${ex.message}`);
        }
    }

    /**
     * Unblock a single user
     *
     * @param {number} userId - User ID to unblock
     * @param {Object} me - Current user object with userId and token
     * @returns {Promise<Object>} Result object with unblocked flag and user
     */
    async unblockUser(userId, me) {
        try {
            const myId = await this._convertToMongoId(me.userId);
            const userIDString = await this._convertToMongoId(userId);

            const userUnblocked = await this._getUserByIntId(userId);

            await this.model.findOneAndRemove({ blocker: myId, blocked: userIDString });

            const apiGateway = new APIGateway();
            const res = await apiGateway.unblockUser(userId, me.token);

            console.log(`Result from API [UNBLOCK user]: ${res}`);

            return { unblocked: true, userUnblocked: userUnblocked };

        } catch (ex) {
            console.error(`Error while unblocking a single user: ${userId}: ERROR: ${ex.message}`);
            throw new Error(`Failed to unblock user: ${ex.message}`);
        }
    }

    /**
     * Get all content storage for a user
     *
     * @param {number|string} user - User ID
     * @returns {Promise<Array>} Array of content storage records
     */
    async getContentStorageFor(user) {
        if (typeof user === 'number') {
            user = await this._convertToMongoId(user);
        }

        const res = await ContentStorage.find({ receiver: user })
            .populate({
                path: 'receiver from',
                select: '_id id name email phone imageUrl status'
            })
            .populate({
                path: 'message',
                select: '-isImported -importedOn -summary -replyTo -__v -uniqueId'
            });

        if (res) {
            // Delete content storage after retrieval
            ContentStorage.deleteMany({ receiver: user })
                .then(() => {
                    console.info('All content storage for user deleted');
                })
                .catch(err => {
                    console.error(`Error deleting all content storage for user: ${err.message}`);
                });
        }

        return res;
    }

    /**
     * Get content storage by ID
     *
     * @param {string} id - Content storage MongoDB ID
     * @returns {Promise<Object>} Content storage record
     */
    async getContentStorageBy(id) {
        return await ContentStorage.findOne({ _id: id });
    }

    /**
     * Delete message object by message ID
     *
     * @param {string} messageId - Message MongoDB ID
     * @returns {Promise<boolean>} Success flag
     */
    async deleteMessageObjectBy(messageId) {
        await ContentStorage.findOneAndDelete({ message: messageId });
        return true;
    }

    /**
     * Set content storage for a user
     *
     * @param {Object} user - User object
     * @param {Object} from - Sender user object
     * @param {string} action - Action type
     * @param {Object} data - Content data
     * @returns {Promise<Object>} Saved content storage record
     */
    async setContentStorageFor(user, from, action, data) {
        const cs = new ContentStorage({
            receiver: user._id,
            message: data.message || null,
            chat: data.chat || null,
            description: data.description || 'Message deleted',
            action: action,
            from: from.id
        });

        return await cs.save();
    }

    /**
     * Send a connection request to someone
     *
     * @param {string} from - Sender MongoDB ID
     * @param {number|string} to - Receiver user ID
     * @returns {Promise<Object>} Result object with title and request
     */
    async sendConnectionRequest(from, to) {
        to = await this._convertToMongoId(to);

        const request = await UserRequestModel.findOne({ from: from, to: to, status: 'new' })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            });

        if (request) {
            request.howMany += 1;
            request.updatedOn = Date.now();
            request.status = 'new';

            await request.save();

            return { title: 'Existing request updated', request: request.toObject() };
        }

        const userRequest = new UserRequestModel({
            from: from,
            to: to
        });

        await userRequest.save();

        const populatedRequest = await userRequest.populate({
            path: 'from to',
            select: utils.userColumnsToShow()
        });

        // Create user connection status
        const ucs = new UserConnectStatus({
            users: [from, to]
        });

        ucs.save()
            .then(() => {
                console.info('User connection status is stored successfully');
            })
            .catch((err) => {
                console.error('Error storing user connect status:', err);
            });

        return { title: 'New request saved', request: populatedRequest.toObject() };
    }

    /**
     * Respond to connection request
     *
     * @param {string} from - Sender MongoDB ID
     * @param {number|string} to - Receiver user ID
     * @param {string} response - Response status (accepted, declined)
     * @returns {Promise<Object>} Result object with title and request
     */
    async respondConnectionRequest(from, to, response) {
        to = await this._convertToMongoId(to);

        const request = await UserRequestModel.findOne({
            $or: [{ from: from, to: to }, { from: to, to: from }],
            status: 'new'
        })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            });

        if (!request) {
            throw new Error('No request found');
        }

        request.updatedOn = Date.now();
        request.status = response;

        await request.save();

        // Update user connection status
        const ucs = await UserConnectStatus.findOne({
            users: { $all: [from, to] },
            status: 'unknown'
        });

        if (ucs) {
            ucs.updatedOn = Date.now();
            ucs.status = response === 'accepted' ? 'connected' : 'disconnected';
            await ucs.save();
            console.info('User connection status updated successfully');
        } else {
            const newUcs = new UserConnectStatus({
                users: [from, to],
                status: response === 'accepted' ? 'connected' : 'disconnected'
            });

            newUcs.save()
                .then(() => {
                    console.info('User connection status is stored successfully');
                })
                .catch((err) => {
                    console.error('Error storing user connect status:', err);
                });
        }

        return { title: 'Existing request updated', request: request.toObject() };
    }

    /**
     * Cancel an active connection request
     *
     * @param {string} from - Sender MongoDB ID
     * @param {number|string} to - Receiver user ID
     * @returns {Promise<Object>} Result object with title and request
     */
    async cancelConnectionRequest(from, to) {
        to = await this._convertToMongoId(to);

        const request = await UserRequestModel.findOne({
            from: from,
            to: to,
            status: 'new'
        })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            });

        if (!request) {
            throw new Error('No request found');
        }

        request.updatedOn = Date.now();
        request.status = 'cancelled';

        await request.save();

        // Update user connection status
        const ucs = await UserConnectStatus.findOne({
            users: { $all: [from, to] },
            status: 'unknown'
        });

        if (ucs) {
            ucs.updatedOn = Date.now();
            ucs.status = 'disconnected';
            await ucs.save();
        } else {
            const newUcs = new UserConnectStatus({
                users: [from, to],
                status: 'disconnected'
            });

            newUcs.save()
                .then(() => {
                    console.info('User connection status is stored successfully');
                })
                .catch((err) => {
                    console.error('Error storing user connect status:', err);
                });
        }

        return { title: 'Request cancelled & updated', request: request.toObject() };
    }

    /**
     * Undo a friendship connection
     *
     * @param {string} from - User MongoDB ID
     * @param {number|string} to - Other user ID
     * @param {string} reason - Reason for disconnection
     * @returns {Promise<Object>} Result object with title and request
     */
    async undoFriendshipConnection(from, to, reason) {
        to = await this._convertToMongoId(to);

        const request = await UserRequestModel.findOne({
            $or: [{ from: from, to: to }, { from: to, to: from }]
        })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            });

        if (!request) {
            throw new Error('No request found');
        }

        request.updatedOn = Date.now();
        request.status = 'disconnected';
        request.reason = reason;

        await request.save();

        // Update user connection status
        const ucs = await UserConnectStatus.findOne({
            users: { $all: [from, to] },
            status: 'connected'
        });

        if (ucs) {
            ucs.updatedOn = Date.now();
            ucs.reason = reason;
            ucs.status = 'disconnected';
            await ucs.save();
        } else {
            const newUcs = new UserConnectStatus({
                users: [from, to],
                status: 'disconnected'
            });

            newUcs.save()
                .then(() => {
                    console.info('User connection status is stored successfully');
                })
                .catch((err) => {
                    console.error('Error storing user connect status:', err);
                });
        }

        return { title: 'Request undone & updated', request: request.toObject() };
    }

    /**
     * Get details for a connection request
     *
     * @param {string} from - User MongoDB ID
     * @param {number|string} to - Other user ID
     * @returns {Promise<Object|null>} Connection request object or null
     */
    async getConnectionRequest(from, to) {
        to = await this._convertToMongoId(to);

        return await UserRequestModel.findOne({
            $or: [{ from: from, to: to }, { from: to, to: from }],
            status: 'new'
        })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            })
            .lean();
    }

    /**
     * Get all connection requests for a user
     *
     * @param {string} userId - User MongoDB ID
     * @returns {Promise<Array>} Array of connection requests
     */
    async allRequests(userId) {
        return await UserRequestModel.find({ to: userId, status: 'new' })
            .populate({
                path: 'to from',
                select: utils.userColumnsToShow()
            })
            .lean();
    }

    /**
     * Toggle radar status for user
     *
     * @param {string} userId - User MongoDB ID
     * @param {boolean} status - Radar status
     * @returns {Promise<Object>} Updated user object
     */
    async updateRadar(userId, status) {
        const query = { _id: userId };
        const date = Date.now();
        const update = {
            $set: {
                radar: { show: status, updatedOn: date }
            }
        };

        return await UserModel.findOneAndUpdate(query, update, { new: true }).lean();
    }

    /**
     * Delete user account
     *
     * @param {string} userId - User MongoDB ID
     * @returns {Promise<Object>} Result object with status and deleted user
     */
    async deleteAccount(userId) {
        const update = {
            'deleted.date': Date.now(),
            'deleted.reason': 'User initiated',
            'deleted.status': true
        };

        const user = await UserModel.findOneAndUpdate(
            { _id: userId },
            update,
            { new: true }
        );

        if (!user) {
            throw new Error('User not found');
        }

        return { status: 'deleted', deletedUser: user };
    }
}

module.exports = UserService;
