const config = require('../../../utils/config');
const twilio = require('twilio');
const client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN);
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const CallHistory = mongoose.model('CallHistory');
const CallRequest = mongoose.model('CallRequest');
const Chat = mongoose.model('Chat');
const Message = mongoose.model('Message');
const BlockUser = mongoose.model('BlockUser');

const helper = require('../../../utils/index');

/**
 * CallService — voice/video call management with Twilio integration.
 * Standalone service; uses Chat/Message models directly for permission checks.
 */
class CallService {
    /**
     * Check if a user can call another user.
     * Validates: block status, chat exists, messages exchanged, permissions granted, rate limits.
     *
     * @param {string} fromUserId - Caller user ID
     * @param {string} toUserId - Callee user ID
     * @param {string} callType - 'voice' or 'video'
     * @returns {Promise<Object>} { allowed: boolean, reason: string, chat: Object }
     */
    async canUserCall(fromUserId, toUserId, callType = 'voice') {
        try {
            // 1. Check if users are blocked
            const blockCheck = await BlockUser.findOne({
                $or: [
                    { blocker: fromUserId, blocked: toUserId },
                    { blocker: toUserId, blocked: fromUserId }
                ]
            });

            if (blockCheck) {
                return {
                    allowed: false,
                    reason: 'Cannot call blocked users',
                    code: 'blocked'
                };
            }

            // 2. Find chat between users
            const chat = await Chat.findOne({
                type: 'private',
                'members.user': { $all: [new ObjectId(fromUserId), new ObjectId(toUserId)] },
                active: true
            }).populate('members.user', '_id id name imageUrl');

            if (!chat) {
                return {
                    allowed: false,
                    reason: 'No chat exists between users. Start a conversation first.',
                    code: 'NO_CHAT'
                };
            }

            // 3. Check if both users have exchanged messages
            const fromUserMessages = await Message.countDocuments({
                chatId: chat._id,
                from: fromUserId,
                'deleted.date': null
            });

            const toUserMessages = await Message.countDocuments({
                chatId: chat._id,
                from: toUserId,
                'deleted.date': null
            });

            if (fromUserMessages === 0 || toUserMessages === 0) {
                return {
                    allowed: false,
                    reason: 'Both users must exchange messages before calls are allowed',
                    code: 'NO_MESSAGES_EXCHANGED'
                };
            }

            // 4. Find caller's member object in chat
            const callerMember = chat.members.find(
                m => m.user._id.toString() === fromUserId.toString()
            );

            if (!callerMember) {
                return {
                    allowed: false,
                    reason: 'Caller not found in chat',
                    code: 'NOT_MEMBER'
                };
            }

            // 5. Check call permission
            if (!callerMember.canCall) {
                return {
                    allowed: false,
                    reason: 'Call permission not granted. Ask the other user to allow calls.',
                    code: 'NO_CALL_PERMISSION'
                };
            }

            // 6. If video call, check canVideo permission
            if (callType === 'video' && !callerMember.canVideo) {
                return {
                    allowed: false,
                    reason: 'Video call permission not granted. Ask the other user to allow video calls.',
                    code: 'NO_VIDEO_PERMISSION'
                };
            }

            // 7. Check missed call rate limit (prevent harassment)
            const recentMissedCalls = await CallHistory.countDocuments({
                from: fromUserId,
                to: toUserId,
                type: 'missed',
                date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            if (recentMissedCalls >= 3) {
                return {
                    allowed: false,
                    reason: 'Too many missed calls. Please wait before trying again.',
                    code: 'RATE_LIMIT_EXCEEDED'
                };
            }

            return {
                allowed: true,
                reason: 'Call allowed',
                chat: chat,
                code: 'ALLOWED'
            };
        } catch (error) {
            console.error('Error checking call permission:', error);
            throw error;
        }
    }

    /**
     * Get Twilio access token for identity
     */
    async getAccessToken(identity) {
        if (!identity) {
            throw new Error('Identity cannot be empty');
        }

        const accountSid = config.TWILIO.ACCOUNTSID;
        const apiKey = config.TWILIO.API_KEY;
        const apiSecret = config.TWILIO.API_KEY_SECRET;

        const token = new AccessToken(accountSid, apiKey, apiSecret);
        token.identity = identity;

        const videoGrant = new VideoGrant();
        token.addGrant(videoGrant);
        const jwt = token.toJwt();

        return { jwt: jwt, token: token };
    }

    /**
     * Create call room with permission validation
     *
     * @param {string} caller
     * @param {string} callee
     * @param {string} callType - 'voice' or 'video'
     * @param {Object} meta - optional { ipAddress, networkInfo }
     */
    async createCallRoom(caller, callee, callType = 'voice', meta = {}) {
        const permissionCheck = await this.canUserCall(caller, callee, callType);
        if (!permissionCheck.allowed) {
            throw new Error(permissionCheck.reason);
        }

        const uniqueId = helper.uniqueId();
        console.log(`Creating call room: ${uniqueId}, type: ${callType}`);

        try {
            const call = await client.video.rooms.create({
                enableTurn: true,
                statusCallback: config.ENV_NAME === 'development'
                    ? 'https://clgmhjdn-3001.euw.devtunnels.ms/api/call/details'
                    : 'https://api.winky.com/api/call/details',
                type: 'peer-to-peer',
                uniqueName: uniqueId,
            });

            const token = await this.getAccessToken(uniqueId);
            const jwt = token.jwt || token.toJwt();

            console.log(`Call room created: ${call.sid}`);

            await this.addCall({
                roomId: call.sid,
                type: 'outgoing',
                from: caller,
                to: callee,
                date: Date.now(),
                userName: uniqueId,
                description: JSON.stringify(call),
                token: jwt,
                other: JSON.stringify(token),
                callType: callType,
                ipAddress: meta.ipAddress || null,
                networkInfo: meta.networkInfo || null
            });

            return { call: call, token: jwt, callType: callType };
        } catch (err) {
            console.error(`Error while creating room: ${err.message}`);

            await this.addCall({
                roomId: 'error',
                type: 'error',
                from: caller,
                to: callee,
                date: Date.now(),
                userName: uniqueId,
                description: err.message,
                callType: callType,
                ipAddress: meta.ipAddress || null,
                networkInfo: meta.networkInfo || null
            });

            throw err;
        }
    }

    /**
     * Invite user to join call room
     */
    async call(roomId, caller, callee) {
        const call = await client.video.rooms(roomId).fetch();

        if (!call) {
            throw new Error('No room found');
        }

        const token = await this.getAccessToken(callee);
        const jwt = token.jwt || token.toJwt();

        await this.addCall({
            roomId: call.sid,
            type: 'incoming',
            from: caller,
            to: callee,
            date: Date.now(),
            userName: call.uniqueName,
            token: jwt,
            description: JSON.stringify(call),
            other: JSON.stringify(token)
        });

        return { call: call, token: jwt };
    }

    /**
     * Complete call room
     */
    async completeRoom(id) {
        const call = await client.video.rooms(id).update({
            status: "completed"
        });

        console.log(`Call Completed: ${call.sid}`);
        return call;
    }

    /**
     * Get call history for a user
     */
    async getHistory(user) {
        console.log(`Getting call history for: ${user}`);

        const calls = await CallHistory.find({
            $or: [{ from: user }, { to: user }]
        })
            .select('-__v')
            .populate({
                path: "from to",
                select: '_id id name email phone imageUrl device'
            })
            .sort({ date: -1 })
            .lean()
            .exec();

        return calls;
    }

    /**
     * Add a call to database
     */
    async addCall(data) {
        console.log(`Adding info for call: ${data.type}`);

        const call = new CallHistory();
        call.roomId = data.roomId;
        call.date = data.date;
        call.type = data.type;
        call.from = data.from;
        call.to = data.userId || data.to;
        call.userName = data.userName;
        call.description = data.description || null;
        call.other = data.other || null;
        call.token = data.token;
        call.callType = data.callType || 'voice';
        call.ipAddress = data.ipAddress || null;
        call.networkInfo = data.networkInfo || null;

        await call.save();
        return { status: 'Call added to history', call: call };
    }

    /**
     * Get call history details by room ID
     */
    async getCall(roomId) {
        console.log(`Get info for call: ${roomId}`);

        const call = await CallHistory.findOne({ roomId: roomId })
            .select('-__v')
            .populate({
                path: "from to",
                select: '_id id name email phone imageUrl device'
            })
            .lean()
            .exec();

        return call;
    }

    /**
     * Update call status from Twilio webhook
     */
    async callStatusUpdate(callDetails) {
        console.log(`Call status update info for call: ${callDetails.RoomSid}`);

        const roomId = callDetails.RoomSid || callDetails.roomId;
        let type = 'initiated';

        if (callDetails.RoomStatus) {
            if (callDetails.RoomStatus === 'completed') {
                type = 'ended';
            }
        }

        const call = await CallHistory.findOneAndUpdate(
            { roomId: roomId },
            {
                type: type,
                date: callDetails.Timestamp || callDetails.date,
                duration: callDetails.RoomDuration
            },
            { new: true }
        );

        if (call) {
            console.log(`Call has been updated: ${type}`);
            return call;
        } else {
            console.log(`No call found for room: ${roomId}`);
            throw new Error(`No call found for room: ${roomId}`);
        }
    }

    /**
     * End an active call
     */
    async endCall(callId, callee, caller) {
        const call = await client.video.rooms(callId).update({
            status: "completed"
        });

        console.log(`Call Ended: ${call.sid}`);

        await this.addCall({
            roomId: call.sid,
            type: 'ended',
            from: caller,
            to: callee,
            date: Date.now(),
            userName: call.uniqueName,
            description: JSON.stringify(call)
        });

        return call;
    }

    /**
     * Record a call attempt before a room is created (declined/cancelled/missed scenarios).
     * Returns the saved CallHistory document so its _id can be stored in pendingRequests.
     *
     * @param {Object} data - { from, to, callType, ipAddress, networkInfo }
     */
    async recordPendingCall(data) {
        const call = new CallHistory();
        call.roomId = null;
        call.date = Date.now();
        call.type = 'initiated';
        call.from = data.from;
        call.to = data.to;
        call.callType = data.callType || 'voice';
        call.ipAddress = data.ipAddress || null;
        call.networkInfo = data.networkInfo || null;

        await call.save();
        console.log(`Pending call recorded: ${call._id}`);
        return call;
    }

    /**
     * Update call type by document _id (used for pending calls before a room is created)
     *
     * @param {string} callId - CallHistory document _id
     * @param {string} type - new type value
     */
    async updateCallStatusById(callId, type) {
        const call = await CallHistory.findByIdAndUpdate(
            callId,
            { type },
            { new: true }
        );
        if (call) console.log(`Pending call ${callId} updated to: ${type}`);
        return call;
    }

    /**
     * Mark call as missed and increment counter
     */
    async markCallAsMissed(callId) {
        const call = await CallHistory.findByIdAndUpdate(
            callId,
            {
                type: 'missed',
                $inc: { missedCallCount: 1 }
            },
            { new: true }
        );

        return call;
    }

    /**
     * Persist a new call request in pending state.
     */
    async saveCallRequest({ requestId, from, to, chatId, mode, ipAddress, networkInfo }) {
        const request = await CallRequest.findOneAndUpdate(
            { requestId },
            {
                $set: {
                    from: new ObjectId(from),
                    to: new ObjectId(to),
                    chatId: chatId && ObjectId.isValid(chatId) ? new ObjectId(chatId) : null,
                    mode: mode === 'video' ? 'video' : 'audio',
                    response: 'pending',
                    ipAddress: ipAddress || null,
                    networkInfo: networkInfo || null,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        return request;
    }

    /**
     * Update the response on an existing call request (accepted / declined / cancelled).
     */
    async recordCallRequestResponse(data) {
        const request = await CallRequest.findOneAndUpdate(
            { requestId: data.requestId },
            {
                $set: {
                    response: data.response,
                    respondedOn: data.respondedOn || new Date(),
                },
            },
            { new: true }
        ).lean();

        return request;
    }

    /**
     * Find an accepted call request for caller->callee that can authorize room creation.
     */
    async getAcceptedCallRequest({ requestId, from, to, chatId }) {
        if (!requestId) {
            return null;
        }

        const query = {
            requestId,
            from: new ObjectId(from),
            to: new ObjectId(to),
            response: 'accepted',
            consumedOn: null,
        };

        if (chatId && ObjectId.isValid(chatId)) {
            query.chatId = new ObjectId(chatId);
        }

        return CallRequest.findOne(query).sort({ respondedOn: -1 }).lean();
    }

    async markCallRequestConsumed(callRequestId) {
        return CallRequest.findByIdAndUpdate(
            callRequestId,
            { consumedOn: new Date() },
            { new: true }
        ).lean();
    }

    /**
     * Revoke call and video permissions for a user in a chat, and disable their
     * active call request(s).
     *
     * @param {string} chatId
     * @param {string} targetUserId - whose permissions to revoke
     * @param {string} [requestId]  - if provided, disables that specific request only
     */
    async revokeCallPermission({ chatId, targetUserId, requestId }) {
        if (!chatId || !ObjectId.isValid(chatId)) {
            throw new Error('Invalid chatId');
        }

        const chatUpdate = Chat.updateOne(
            { _id: new ObjectId(chatId) },
            {
                $set: {
                    'members.$[target].canCall': false,
                    'members.$[target].canVideo': false,
                    'members.$[target].updatedOn': new Date(),
                },
            },
            { arrayFilters: [{ 'target.user': new ObjectId(targetUserId) }] }
        );

        let requestUpdate;
        if (requestId) {
            requestUpdate = CallRequest.updateOne(
                { requestId, response: 'accepted', consumedOn: null },
                { $set: { response: 'disabled' } }
            );
        } else {
            const query = { to: new ObjectId(targetUserId), response: 'accepted', consumedOn: null };
            query.chatId = new ObjectId(chatId);
            requestUpdate = CallRequest.updateMany(query, { $set: { response: 'disabled' } });
        }

        await Promise.all([chatUpdate, requestUpdate]);
    }

    /**
     * Ensure both chat members can call after request acceptance.
     */
    async syncChatCallPermissions(chatId, callerId, calleeId, mode = 'audio') {
        if (!chatId || !ObjectId.isValid(chatId)) {
            return;
        }

        const set = {
            'members.$[caller].canCall': true,
            'members.$[caller].updatedOn': new Date(),
            'members.$[callee].canCall': true,
            'members.$[callee].updatedOn': new Date(),
        };

        if (mode === 'video') {
            set['members.$[caller].canVideo'] = true;
            set['members.$[callee].canVideo'] = true;
        }

        await Chat.updateOne(
            { _id: new ObjectId(chatId) },
            { $set: set },
            {
                arrayFilters: [
                    { 'caller.user': new ObjectId(callerId) },
                    { 'callee.user': new ObjectId(calleeId) },
                ],
            }
        );
    }
}

module.exports = CallService;
