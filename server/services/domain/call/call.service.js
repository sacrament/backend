const config = require('../../../utils/config');
const twilio = require('twilio');
const client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN);
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const CallHistory = mongoose.model('CallHistory');
const Chat = mongoose.model('Chat');
const Message = mongoose.model('Message');
const BlockUser = mongoose.model('BlockUser');
const ChatService = require('../chat/chat.service');

const helper = require('../../../utils/index');

/**
 * CallService with permission validation and safety checks
 * Implements PDF requirements for call permissions
 *
 * @class CallService
 * @extends {ChatService}
 */
class CallService extends ChatService {
    /**
     * Check if a user can call another user
     * Validates: chat exists, messages exchanged, permissions granted, not blocked, rate limits
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
                    code: 'BLOCKED'
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

            // 5. Check call permission (canCall must be true for voice calls)
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
                date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
            });

            if (recentMissedCalls >= 3) {
                return {
                    allowed: false,
                    reason: 'Too many missed calls. Please wait before trying again.',
                    code: 'RATE_LIMIT_EXCEEDED'
                };
            }

            // All checks passed
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
     *
     * @param {string} identity - User identity
     * @returns {Promise<Object>} JWT token
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
     * @param {string} caller - Caller user ID
     * @param {string} callee - Callee user ID
     * @param {string} callType - 'voice' or 'video'
     * @returns {Promise<Object>} Call details with token
     */
    async createCallRoom(caller, callee, callType = 'voice') {
        // Validate permissions first
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
                    ? 'http://192.168.100.51:3001/api/call/details'
                    : 'https://chat.winky.com/api/call/details',
                type: 'peer-to-peer',
                uniqueName: uniqueId,
            });

            const token = await this.getAccessToken(uniqueId);
            const jwt = token.jwt || token.toJwt();

            console.log(`Call room created: ${call.sid}`);

            // Store call in database
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
                callType: callType
            });

            return { call: call, token: jwt, callType: callType };
        } catch (err) {
            console.error(`Error while creating room: ${err.message}`);

            // Log failed call
            await this.addCall({
                roomId: 'error',
                type: 'error',
                from: caller,
                to: callee,
                date: Date.now(),
                userName: uniqueId,
                description: err.message,
                callType: callType
            });

            throw err;
        }
    }

    /**
     * Invite user to join call room
     *
     * @param {string} roomId - Twilio room ID
     * @param {string} caller - Caller user ID
     * @param {string} callee - Callee user ID
     * @returns {Promise<Object>} Call details with token
     */
    async call(roomId, caller, callee) {
        const call = await client.video.rooms(roomId).fetch();

        if (!call) {
            throw new Error('No room found');
        }

        const token = await this.getAccessToken(callee);
        const jwt = token.jwt || token.toJwt();

        // Store incoming call
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
     *
     * @param {string} id - Room ID
     * @returns {Promise<Object>} Completed call
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
     *
     * @param {string} user - User ID
     * @returns {Promise<Array>} Call history
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
     *
     * @param {Object} data - Call data
     * @returns {Promise<Object>} Saved call
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

        await call.save();
        return { status: 'Call added to history', call: call };
    }

    /**
     * Get call history details by room ID
     *
     * @param {string} roomId - Room ID
     * @returns {Promise<Object>} Call details
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
     *
     * @param {Object} callDetails - Twilio webhook data
     * @returns {Promise<Object>} Updated call
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
     *
     * @param {string} callId - Call/Room ID
     * @param {string} callee - Callee user ID
     * @param {string} caller - Caller user ID
     * @returns {Promise<Object>} Ended call
     */
    async endCall(callId, callee, caller) {
        const call = await client.video.rooms(callId).update({
            status: "completed"
        });

        console.log(`Call Ended: ${call.sid}`);

        // Store ended call
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
     * Mark call as missed and increment counter
     *
     * @param {string} callId - Call history ID
     * @returns {Promise<Object>} Updated call
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
}

module.exports = CallService;
