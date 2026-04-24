const crypto = require('crypto');
const SMSService = require('../../external/twilio/sms.service');
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const ContentStorage = mongoose.model('ContentStorage');
const APIGateway = require('../../external/aws/api.gateway');

const UserRequestModel = require('../../../models/user.request').UserRequest;
const UserConnectStatus = require('../../../models/user.connect').UserConnectStatus;

const utils = require('../../../utils/index');
const { getIO } = require('../../../socket/io');
const _ = require('lodash');

class UserService {
    constructor() {
        this.model = UserModel;
    }

    #normalizeInterestedIn(interestedIn) {
        const aliasMap = { both: 'everyone' };
        const validValues = new Set(['women', 'men', 'everyone', 'non-binary']);

        if (interestedIn === undefined || interestedIn === null) {
            return interestedIn;
        }

        const normalizeValue = (value) => {
            if (typeof value !== 'string') {
                return null;
            }

            const normalized = aliasMap[value.trim().toLowerCase()] || value.trim().toLowerCase();
            return validValues.has(normalized) ? normalized : null;
        };

        if (Array.isArray(interestedIn)) {
            const normalizedValues = interestedIn
                .map(normalizeValue)
                .filter(Boolean);

            if (normalizedValues.includes('women') && normalizedValues.includes('men')) {
                return 'everyone';
            }

            return normalizedValues[0] ?? interestedIn;
        }

        return normalizeValue(interestedIn) ?? interestedIn;
    }

    /**
     * Derive a consistent, non-reversible hash for a phone number.
     * Used for indexed lookups — same input always produces the same key.
     */
    #hashPhone(phoneNumber) {
        const pepper = process.env.OTP_PHONE_HASH_SECRET;
        if (!pepper) throw new Error('OTP_PHONE_HASH_SECRET is not set');
        return crypto.createHmac('sha256', pepper).update(phoneNumber).digest('hex');
    }

    /**
     * Encrypt a phone number with AES-256-GCM using the current key version.
     *
     * Stored format: v{version}:{iv}:{authTag}:{ciphertext}  (iv/tag/data in base64)
     *
     * Key rotation: add PHONE_ENC_KEY_{n} and bump PHONE_ENC_KEY_VERSION to n.
     * Old records are decrypted with their versioned key; new records use the current one.
     */
    #encryptPhone(phoneNumber) {
        const version = process.env.PHONE_ENC_KEY_VERSION;
        if (!version) throw new Error('PHONE_ENC_KEY_VERSION is not set');
        const keyHex = process.env[`PHONE_ENC_KEY_${version}`];
        if (!keyHex) throw new Error(`PHONE_ENC_KEY_${version} is not set`);

        const key      = Buffer.from(keyHex, 'hex');
        const iv       = crypto.randomBytes(12);
        const cipher   = crypto.createCipheriv('aes-256-gcm', key, iv);
        const data     = Buffer.concat([cipher.update(phoneNumber, 'utf8'), cipher.final()]);

        return `v${version}:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
    }

    /**
     * Decrypt a phone number produced by #encryptPhone.
     * Reads the key version from the stored value so old records survive key rotation.
     * @param {string} stored  The v{n}:iv:authTag:ciphertext string from the DB
     * @returns {string} The original phone number
     */
    decryptPhone(stored) {
        const [versionTag, ivB64, tagB64, dataB64] = stored.split(':');
        const version = versionTag.slice(1); // strip the leading 'v'
        const keyHex  = process.env[`PHONE_ENC_KEY_${version}`];
        if (!keyHex) throw new Error(`PHONE_ENC_KEY_${version} is not set — cannot decrypt`);

        const key      = Buffer.from(keyHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return decipher.update(Buffer.from(dataB64, 'base64')) + decipher.final('utf8');
    }

    /**
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
    async getUserById(userId) {
        return this.model
            .findOne({ _id: userId })
            .populate('location', 'point recordedAt')
            .populate('device')
            .lean()
            .exec();
    }

    /**
     * Check whether a user is currently logged in.
     * A user is considered logged in if they have a non-null refreshToken
     * and an active device with push notifications enabled.
     *
     * @param {string} userId - MongoDB ObjectId
     * @returns {Promise<boolean>} true if the user is logged in
     */
    async isUserLoggedIn(userId) {
        const user = await this.model
            .findOne({ _id: userId })
            .select('refreshToken device')
            .populate('device', 'status')
            .lean()
            .exec();

        if (!user || !user.refreshToken) return false;
        if (user.device && user.device.status === 'disabled') return false;
        return true;
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

        const foundUsers = await this.model.find({ _id: { $in: users } }).select('_id');

        if (!foundUsers || foundUsers.length === 0) {
            return [];
        }

        return foundUsers.map(user => user._id.toString());
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

        const entries  = phones.map(p => ({ phone: p, phoneHash: this.#hashPhone(p) }));
        const hashes   = entries.map(e => e.phoneHash);

        const users = await this.model.find({ phoneHash: { $in: hashes } })
            .select('_id id name email phoneHash imageUrl status')
            .lean();

        const result = entries.map(({ phone, phoneHash }) => {
            const user = users.find(u => u.phoneHash === phoneHash);
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
     * Save refresh token for user
     *
     * @param {number} userId - User integer ID
     * @param {string} refreshToken - Refresh token
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found
     */
    async saveRefreshToken(userId, refreshToken) {
        console.log(`Save refresh token for user: ${userId}`);

        const date = Date.now();
        const update = {
            $set: {
                refreshToken: refreshToken,
                updatedOn: date
            }
        };

        const user = await this.model.findByIdAndUpdate(userId, update, { new: true }).lean();

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
                reason: reason || 'NO_REASON',
                description: description || 'Blocked via chat',
                status: 'active'
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
            const myId = me.userId;
            const userIDString = userId;

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
                    reason: reason || 'NO_REASON',
                    description: description || 'Misbehaving',
                    status: 'active'
                });

                await block.save();
            }

            // Cascade block to all shared chats
            const ChatModel = mongoose.model('Chat');
            const now = Date.now();

            // Blocked user loses canChat access
            await ChatModel.updateMany(
                { 'members.user': { $all: [myId, userIDString] } },
                { $set: { 'members.$[m].canChat': false, 'members.$[m].options.blocked': true, 'members.$[m].updatedOn': now } },
                { arrayFilters: [{ 'm.user': userIDString }] }
            );

            // Blocker's side is also flagged as blocked so the UI reflects it
            await ChatModel.updateMany(
                { 'members.user': { $all: [myId, userIDString] } },
                { $set: { 'members.$[m].options.blocked': true, 'members.$[m].updatedOn': now } },
                { arrayFilters: [{ 'm.user': myId }] }
            );

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
            const myId = me.userId;
            const userIDString = userId;

            const userUnblocked = await this._getUserByIntId(userId);

            await this.model.findOneAndRemove({ blocker: myId, blocked: userIDString });

            // Restore chat access in all shared chats
            const ChatModel = mongoose.model('Chat');
            const now = Date.now();

            await ChatModel.updateMany(
                { 'members.user': { $all: [myId, userIDString] } },
                { $set: { 'members.$[m].canChat': true, 'members.$[m].options.blocked': false, 'members.$[m].updatedOn': now } },
                { arrayFilters: [{ 'm.user': userIDString }] }
            );

            await ChatModel.updateMany(
                { 'members.user': { $all: [myId, userIDString] } },
                { $set: { 'members.$[m].options.blocked': false, 'members.$[m].updatedOn': now } },
                { arrayFilters: [{ 'm.user': myId }] }
            );

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
        const existing = await UserRequestModel.findOne({ from, to });

        if (existing) {
            if (existing.status === 'new') {
                return { title: 'Request already pending', request: existing.toObject() };
            }
            if (existing.status === 'accepted') {
                throw new Error('Already connected');
            }
            // for declined we need to not allow resend for 24 hours, for cancelled we can allow resend immediately, for disconnected we can allow resend immediately
            if (existing.status === 'declined' && (Date.now() - existing.updatedOn) < 24 * 60 * 60 * 1000) {
                throw new Error('Cannot re-send request. Please wait 24 hours');
            }
            // declined / cancelled / disconnected — allow re-send
            existing.status = 'new';
            existing.howMany += 1;
            await existing.save();

            const populated = await existing.populate({ path: 'from to', select: utils.userColumnsToShow() });
            return { title: 'Request resent', request: populated.toObject() };
        }

        const userRequest = new UserRequestModel({ from, to });
        await userRequest.save();

        const populatedRequest = await userRequest.populate({
            path: 'from to',
            select: utils.userColumnsToShow()
        });

        // Create user connection status
        const ucs = new UserConnectStatus({ users: [from, to] });
        ucs.save().catch(err => console.error('Error storing user connect status:', err));

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

        const result = { title: 'Existing request updated', request: request.toObject() };

        try {
            getIO().to(to).emit('connection request response', {
                response,
                from,
                request: result.request
            });
        } catch (_) {}

        return result;
    }

    /**
     * Cancel an active connection request
     *
     * @param {string} from - Sender MongoDB ID
     * @param {number|string} to - Receiver user ID
     * @returns {Promise<Object>} Result object with title and request
     */
    async cancelConnectionRequest(from, to) {

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

        return await UserRequestModel.findOne({
            $or: [{ from: from, to: to }, { from: to, to: from }]
        })
        .populate({
            path: 'to from',
            select: utils.userColumnsToShow()
        })
        .lean();
    }

    /**
     * Get all connection requests and connection statuses for a user.
     * Returns every request the user sent or received (all statuses), plus
     * all UserConnectStatus records they are part of — so the client can
     * fully reconstruct social state after a reinstall.
     *
     * @param {string} userId - User MongoDB ID
     * @returns {Promise<{requests: Array, connections: Array}>}
     */
    async allRequests(userId) {
        const [requests, connections] = await Promise.all([
            UserRequestModel.find({
                $or: [{ from: userId }, { to: userId }]
            })
                .populate({ path: 'to from', select: utils.userColumnsToShow() })
                .sort({ createdOn: -1 })
                .lean(),

            UserConnectStatus.find({ users: userId })
                .populate({ path: 'users', select: utils.userColumnsToShow() })
                .sort({ createdOn: -1 })
                .lean(),
        ]);

        return { requests, connections };
    }

    /**
     * Toggle radar status for user
     *
     * @param {string} userId - User MongoDB ID
     * @param {boolean} status - Radar status
     * @returns {Promise<Object>} Updated user object
     */
    async updatePresence(userId) {
        return await UserModel.findByIdAndUpdate(
            userId,
            { $set: { lastSeen: new Date() } },
            { new: true }
        ).lean();
    }

    async updateRadarEnabled(userId, enabled) {
        return await UserModel.findByIdAndUpdate(
            userId,
            { $set: { 'radar.enabled': enabled, 'radar.updatedOn': new Date() } },
            { new: true }
        ).lean();
    }

    async updateRadarInvisible(userId, invisible) {
        return await UserModel.findByIdAndUpdate(
            userId,
            { $set: { 'radar.invisible': invisible, 'radar.updatedOn': new Date() } },
            { new: true }
        ).lean();
    }

    /**
     * Delete user account
     *
     * @param {string} userId - User MongoDB ID
     * @returns {Promise<Object>} Result object with status and deleted user
     */
    async deleteAccount(userId) {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { deleted: true, deletedOn: new Date(), deletedReason: 'User initiated' } },
            { new: true }
        );

        if (!user) throw new Error('User not found');

        return { status: 'deleted', deletedUser: user };
    }

    async updateVisibilityPreferences(userId, prefs) {
        const update = {};
        if (typeof prefs.womenOnly === 'boolean') update['visibilityPreferences.womenOnly'] = prefs.womenOnly;
        if (typeof prefs.menOnly   === 'boolean') update['visibilityPreferences.menOnly']   = prefs.menOnly;
        if (typeof prefs.nonBinaryOnly === 'boolean') update['visibilityPreferences.nonBinaryOnly'] = prefs.nonBinaryOnly;
        if (typeof prefs.photoBlur === 'boolean') update['visibilityPreferences.photoBlur'] = prefs.photoBlur;

        const user = await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true });
        if (!user) throw new Error('User not found');
        return user.visibilityPreferences;
    }

    async updateNotificationPreferences(userId, prefs) {
        const fields = ['newMessages', 'chatRequests', 'connectionRequests', 'nearbyWinks', 'sound', 'vibration', 'badge'];
        const update = {};
        for (const key of fields) {
            if (typeof prefs[key] === 'boolean') update[`notificationPreferences.${key}`] = prefs[key];
        }

        const user = await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true });
        if (!user) throw new Error('User not found');
        return user.notificationPreferences;
    }

    async updateProfilePrivacy(userId, prefs) {
        const fields = ['showBio', 'showAge', 'showGender', 'showLocation', 'showContact', 'showInterestedIn'];
        const update = {};
        for (const key of fields) {
            if (typeof prefs[key] === 'boolean') update[`privacySettings.${key}`] = prefs[key];
        }

        const user = await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true });
        if (!user) throw new Error('User not found');
        return user.privacySettings;
    }

    // ─── Auth helpers ──────────────────────────────────────────────────────────

    async findOrCreateByFacebook(fbUser) {
        let user = await UserModel.findOne({ facebookId: fbUser.id });
        if (!user) {
            user = await new UserModel({
                facebookId: fbUser.id,
                name: fbUser.name || 'Facebook User',
                email: fbUser.email || null,
                imageUrl: fbUser.picture?.data?.url || null,
                status: 'active',
                registeredOn: new Date(),
                isPublic: false
            }).save();
        }
        if (user.status === 'blocked') {
            const err = new Error('User is blocked');
            err.httpStatus = 403; err.code = 1010;
            throw err;
        }
        return user;
    }

    async findOrCreateByApple(appleUser) {
        let user = await UserModel.findOne({ appleId: appleUser.id });
        if (!user) {
            user = await new UserModel({
                appleId: appleUser.id,
                name: appleUser.name || 'Apple User',
                email: appleUser.email || null,
                status: 'active',
                registeredOn: new Date(),
                isPublic: false
            }).save();
        }
        if (user.status === 'blocked') {
            const err = new Error('User is blocked');
            err.httpStatus = 403; err.code = 1010;
            throw err;
        }
        return user;
    }

    async findOrCreateByGoogle(googleUser) {
        let user = await UserModel.findOne({ googleId: googleUser.id });
        if (!user) {
            user = await new UserModel({
                googleId:  googleUser.id,
                name:      googleUser.name  || 'Google User',
                email:     googleUser.email || null,
                imageUrl:  googleUser.picture || null,
                status:    'active',
                registeredOn: new Date(),
                isPublic:  false
            }).save();
        }
        if (user.status === 'blocked') {
            const err = new Error('User is blocked');
            err.httpStatus = 403; err.code = 1010;
            throw err;
        }
        return user;
    }

    async findOrCreateByPhone(phoneNumber) {
        const phoneHash = this.#hashPhone(phoneNumber);
        let user = await UserModel.findOne({ partition: phoneHash });
        if (!user) {
            user = await new UserModel({
                partition: phoneHash,
                phone: this.#encryptPhone(phoneNumber),
                status: 'active',
                registeredOn: new Date(),
                isPublic: false
            }).save();
        }
        if (user.status === 'blocked') {
            const err = new Error('User is blocked');
            err.httpStatus = 403; err.code = 1010;
            throw err;
        }
        // decrypt phone for response if it's the same user
        if (user.phone) {
            user.phone = this.decryptPhone(user.phone);
        }
        return user;
    }

    async getActiveUserById(userId) {
        return UserModel.findById(userId);
    }

    async clearRefreshToken(userId) {
        await UserModel.findByIdAndUpdate(userId, { refreshToken: null });
    }

    // ─── Profile / picture / device / location ─────────────────────────────────

    async updateProfile(userId, fields) {
        const user = await UserModel.findById(userId);
        if (!user) throw new Error('User not found');

        const { name, email, imageUrl, isPublic, bio, gender, dateOfBirth, interestedIn } = fields;
        if (name !== undefined)        user.name        = name;
        if (email !== undefined)       user.email       = email;
        if (imageUrl !== undefined)    user.imageUrl    = imageUrl;
        if (bio !== undefined)         user.bio         = bio;
        if (isPublic !== undefined)    user.isPublic    = isPublic;
        if (gender !== undefined)      user.gender      = gender;
        if (interestedIn !== undefined) {
            user.interestedIn = this.#normalizeInterestedIn(interestedIn);
        }
        if (dateOfBirth !== undefined) {
            user.dateOfBirth = new Date(dateOfBirth);
            // keep age in sync
            const ageDiff = Date.now() - user.dateOfBirth.getTime();
            user.age = Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
        }
        user.updatedOn = new Date();

        await user.save();
        return user;
    }

    async updatePicture(userId, pictureUrl) {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { imageUrl: pictureUrl } },
            { new: true }
        );
        if (!user) throw new Error('User not found');
        return user;
    }

    async updateDeviceWithHistory(userId, deviceToken, platform = 'IOS') {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { device: { token: deviceToken, type: platform, updatedOn: new Date() } } },
            { new: true }
        );
        if (!user) throw new Error('User not found');

        try {
            const DeviceModel = mongoose.model('Device');
            await DeviceModel.findOneAndUpdate(
                { user: userId },
                { token: deviceToken, type: platform, updatedOn: new Date(), isActive: true },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('Device collection update error:', err);
        }

        return user;
    }

    async updateLocation(userId, lat, lon) {
        const LocationModel = mongoose.model('Location');
        const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Supersede all previous current locations for this user
        await LocationModel.updateMany(
            { user: userId, isCurrent: true },
            { $set: { isCurrent: false, expiresAt: thirtyDays } }
        );

        const locationDoc = await LocationModel.create({
            user: userId,
            point: { type: 'Point', coordinates: [lon, lat] },
            isCurrent: true,
            recordedAt: new Date(),
        });

        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { location: locationDoc._id, lastSeen: new Date() } },
            { new: true }
        );
        if (!user) throw new Error('User not found');

        return user;
    }

    async hardDeleteAccount(userId) {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { deleted: true, deletedOn: new Date(), deletedReason: 'User initiated' } },
            { new: true }
        );
        if (!user) throw new Error('User not found');
        return user;
    }

    // ─── Device (embedded-only, no Device collection) ──────────────────────────

    async updateDevice(userId, deviceToken, platform = 'IOS') {
        const user = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { device: { token: deviceToken, type: platform, updatedOn: new Date() } } },
            { new: true }
        );
        if (!user) throw new Error('User not found');
        return user;
    }

    // ─── Search / phone verification ───────────────────────────────────────────

    async searchByName(name, page = 0, size = 20) {
        const skip = page * size;
        const filter = {
            name: { $regex: name.trim(), $options: 'i' },
            status: 'active',
            deleted: { $ne: true }
        };
        const [users, total] = await Promise.all([
            UserModel.find(filter).skip(skip).limit(size).sort({ name: 1 }),
            UserModel.countDocuments(filter)
        ]);
        return { users, totalPages: Math.ceil(total / size) };
    }

    async findUsersByPhones(phones) {
        // Hash each phone so we can match against the stored hashes.
        // The original phone is carried through so the caller gets it back in the response.
        const entries = phones.map(p => ({ phone: p, phoneHash: this.#hashPhone(p) }));
        const hashes  = entries.map(e => e.phoneHash);

        const users = await UserModel.find(
            { phoneHash: { $in: hashes }, deleted: { $ne: true } },
            { phoneHash: 1, name: 1, imageUrl: 1 }
        );

        return entries
            .filter(e => users.some(u => u.phoneHash === e.phoneHash))
            .map(e => {
                const u = users.find(u => u.phoneHash === e.phoneHash);
                return { phone: e.phone, id: u._id.toString(), name: u.name, pictureUrl: u.imageUrl };
            });
    }

    // ─── Favorites ─────────────────────────────────────────────────────────────

    async getFavorites(userId) {
        const user = await UserModel.findById(userId).populate({
            path: 'favorites',
            select: '_id name imageUrl bio gender age interestedIn isPublic status'
        });
        if (!user) throw new Error('User not found');
        return user.favorites || [];
    }

    async addFavorite(userId, favoriteUserId) {
        const targetExists = await UserModel.exists({ _id: favoriteUserId, deleted: { $ne: true } });
        if (!targetExists) throw new Error('User not found');
        await UserModel.findByIdAndUpdate(userId, { $addToSet: { favorites: favoriteUserId } });
    }

    async removeFavorite(userId, targetUserId) {
        await UserModel.findByIdAndUpdate(userId, { $pull: { favorites: targetUserId } });
    }
}

module.exports = UserService;
