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
                // type: 'private',
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


            // 7. Check missed call rate limit (prevent harassment)
            const recentMissedCalls = await CallHistory.countDocuments({
                from:       fromUserId,
                to:         toUserId,
                status:     'missed',
                startedAt:  { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
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
                maxParticipants: 2,
                maxParticipantDuration: 15 * 60, // 15 minutes
                emptyRoomTimeout: 30, // delete room if no participants join within 30 seconds of creation
                statusCallback: config.ENV_NAME === 'development'
                    ? 'https://clgmhjdn-3001.euw.devtunnels.ms/api/webhook/twilio/details'
                    : 'https://service.winky.com/api/webhook/twilio/details',
                type: 'peer-to-peer',
                uniqueName: uniqueId,
            });

            const token = await this.getAccessToken(uniqueId);
            const jwt = token.jwt || token.toJwt();

            console.log(`Call room created: ${call.sid}`);

            const { call: callRecord } = await this.addCall({
                roomId:      call.sid,
                from:        caller,
                to:          callee,
                userName:    uniqueId,
                callType:    callType,
                ipAddress:   meta.ipAddress || null,
                networkInfo: meta.networkInfo || null,
            });

            return { call: call, token: jwt, callType: callType, callHistoryId: callRecord._id.toString() };
        } catch (err) {
            console.error(`Error while creating room: ${err.message}`);

            await this.addCall({
                roomId:      'error',
                from:        caller,
                to:          callee,
                userName:    uniqueId,
                callType:    callType,
                status:      'error',
                ipAddress:   meta.ipAddress || null,
                networkInfo: meta.networkInfo || null,
            });

            throw err;
        }
    }

    /**
     * Invite user to join call room — marks the call as answered.
     * Returns a Twilio token for the callee to connect with.
     */
    async call(roomId, caller, callee) {
        const call = await client.video.rooms(roomId).fetch();

        if (!call) {
            throw new Error('No room found');
        }

        const token = await this.getAccessToken(callee);
        const jwt = token.jwt || token.toJwt();

        // Mark the single call document as answered
        await CallHistory.findOneAndUpdate(
            { roomId: call.sid },
            { $set: { status: 'answered', answered: true, answeredAt: new Date() } }
        );

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
            .sort({ startedAt: -1 })
            .lean()
            .exec();

        return calls;
    }

    /**
     * Add a call record to history (one per call lifetime).
     */
    async addCall(data) {
        const call = new CallHistory({
            roomId:          data.roomId,
            from:            data.from,
            to:              data.userId || data.to,
            userName:        data.userName || null,
            callType:        data.callType || 'voice',
            status:          data.status || 'ringing',
            startedAt:       data.startedAt || new Date(),
            ipAddress:       data.ipAddress || null,
            networkInfo:     data.networkInfo || null,
        });

        await call.save();
        console.log(`Call record created: ${call._id}`);
        return { status: 'Call added to history', call };
    }

    /**
     * Get call history details by room ID (Twilio SID)
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
     * Get call history details by MongoDB document _id.
     * Preferred over getCall when the server-issued callHistoryId is available.
     */
    async getCallById(callHistoryId) {
        return CallHistory.findById(callHistoryId)
            .select('-__v')
            .populate({
                path: 'from to',
                select: '_id id name email phone imageUrl device'
            })
            .lean()
            .exec();
    }

    /**
     * Update call from Twilio webhook — updates end time and duration on the existing document.
     */
    async callStatusUpdate(callDetails) {
        const roomId = callDetails.RoomSid || callDetails.roomId;
        const event  = callDetails.StatusCallbackEvent || callDetails.RoomStatus;

        console.log(`[Twilio webhook] event=${event} roomId=${roomId} RoomStatus=${callDetails.RoomStatus} RoomDuration=${callDetails.RoomDuration}`);

        // Only act on room completion events
        const isCompleted = callDetails.RoomStatus === 'completed' || event === 'room-ended';
        if (!isCompleted) {
            console.log(`[Twilio webhook] ignoring event: ${event}`);
            return;
        }

        if (!roomId) {
            console.warn('[Twilio webhook] no roomId in payload, skipping');
            return;
        }

        const now = new Date();
        const durationSecs = callDetails.RoomDuration ? parseInt(callDetails.RoomDuration, 10) : null;

        const existing = await CallHistory.findOne({ roomId }).lean();
        if (!existing) {
            console.warn(`[Twilio webhook] no CallHistory found for room: ${roomId}`);
            return;
        }

        const wasAnswered = existing.answered === true;
        const answeredAt  = existing.answeredAt || null;

        const update = {
            endedAt: now,
            status:  wasAnswered ? 'ended' : 'missed',
            durationSeconds: durationSecs !== null
                ? durationSecs
                : (wasAnswered && answeredAt
                    ? Math.round((now - new Date(answeredAt)) / 1000)
                    : null),
        };

        const call = await CallHistory.findOneAndUpdate(
            { roomId },
            { $set: update },
            { new: true }
        );

        console.log(`[Twilio webhook] CallHistory updated — roomId=${roomId} status=${update.status} duration=${update.durationSeconds}s`);
        return call;
    }

    /**
     * End an active call — updates the single history document with end time and duration.
     */
    async endCall(callId, callee, caller) {
        const call = await client.video.rooms(callId).update({
            status: 'completed'
        });

        console.log(`Call Ended: ${call.sid}`);

        const now = new Date();

        // Fetch current record to check whether it was answered
        const existing = await CallHistory.findOne({ roomId: call.sid }).lean();
        const wasAnswered = existing?.answered === true;
        const answeredAt  = existing?.answeredAt || null;

        const update = {
            endedAt: now,
            status:  wasAnswered ? 'ended' : 'missed',
            durationSeconds: (wasAnswered && answeredAt)
                ? Math.round((now - new Date(answeredAt)) / 1000)
                : null,
        };

        const record = await CallHistory.findOneAndUpdate(
            { roomId: call.sid },
            { $set: update },
            { new: true }
        );

        return record || call;
    }

    /**
     * Record a call attempt before a room is created (declined/cancelled/missed scenarios).
     * Returns the saved CallHistory document so its _id can be stored in pendingRequests.
     *
     * @param {Object} data - { from, to, callType, ipAddress, networkInfo }
     */
    async recordPendingCall(data) {
        const call = new CallHistory({
            roomId:      null,
            from:        data.from,
            to:          data.to,
            callType:    data.callType || 'voice',
            status:      'ringing',
            ipAddress:   data.ipAddress || null,
            networkInfo: data.networkInfo || null,
        });

        await call.save();
        console.log(`Pending call recorded: ${call._id}`);
        return call;
    }

    /**
     * Update call status by document _id (used for pending calls before a room is created)
     */
    async updateCallStatusById(callId, status) {
        const call = await CallHistory.findByIdAndUpdate(
            callId,
            { status },
            { new: true }
        );
        if (call) console.log(`Call ${callId} status updated to: ${status}`);
        return call;
    }

    /**
     * Mark call as missed and increment counter
     */
    /**
     * Check if a user is currently in an active call (ringing or answered, not yet ended).
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async isUserInActiveCall(userId) {
        const active = await CallHistory.findOne({
            $or: [{ from: userId }, { to: userId }],
            status: { $in: ['ringing', 'answered'] },
            endedAt: null,
        }).lean();
        return !!active;
    }

    /**
     * Record a call that was rejected because the callee was busy on another call.
     * @param {{ from, to, callType, ipAddress, networkInfo }} data
     * @returns {Promise<CallHistory>}
     */
    async recordBusyRejection(data) {
        const call = new CallHistory({
            roomId:      null,
            from:        data.from,
            to:          data.to,
            callType:    data.callType || 'voice',
            status:      'rejected',
            endedAt:     new Date(),
            ipAddress:   data.ipAddress || null,
            networkInfo: data.networkInfo || null,
        });
        await call.save();
        console.log(`Busy rejection recorded: ${call._id}`);
        return call;
    }

    /**
     * Mark call as missed and increment rate-limit counter.
     */
    async markCallAsMissed(callId) {
        return CallHistory.findByIdAndUpdate(
            callId,
            {
                status: 'missed',
                answered: false,
                $inc: { missedCallCount: 1 },
            },
            { new: true }
        );
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
     * Find a pending call request by requestId that is still within the 24-hour active window.
     * Used as a DB fallback when the in-memory pendingRequests Map doesn't have the entry
     * (e.g. callee was offline when the request was sent, or the server restarted).
     *
     * @param {string} requestId
     * @returns {Promise<Object|null>}
     */
    async getPendingCallRequest(requestId) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return CallRequest.findOne({
            requestId,
            response: 'pending',
            createdOn: { $gte: cutoff },
        }).lean();
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
            $or: [
                { from: new ObjectId(from), to: new ObjectId(to) },
                { from: new ObjectId(to), to: new ObjectId(from) },
            ],
            response: 'accepted',
            // consumedOn: null,
        };

        if (chatId && ObjectId.isValid(chatId)) {
            query.chatId = new ObjectId(chatId);
        }

        const request = await CallRequest.findOne(query).sort({ respondedOn: -1 }).lean();
        
        return request;
    }

    /**
     * Get call requests for a user (as sender or receiver).
     *
     * @param {string} userId
     * @param {string} [response] - optional filter: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'disabled'
     */
    async getCallRequests(userId, response) {
        const query = {
            $or: [
                { from: userId },
                { to: userId },
            ],
        };

        if (response) {
            query.response = response;
        }

        return CallRequest.find(query)
            .populate('from to', '_id id name imageUrl')
            .sort({ createdOn: -1 })
            .lean();
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
        const set = {
            'members.$[caller].canCall': true,
            'members.$[caller].updatedOn': new Date(),
            'members.$[callee].canCall': true,
            'members.$[callee].updatedOn': new Date(),
            'members.$[caller].canVideo': true,
            'members.$[callee].canVideo': true,
        };

        const filter = chatId && ObjectId.isValid(chatId)
            ? { _id: new ObjectId(chatId) }
            : { 'members.user': { $all: [new ObjectId(callerId), new ObjectId(calleeId)] } };

        const result = await Chat.updateOne(
            filter,
            { $set: set },
            {
                arrayFilters: [
                    { 'caller.user': new ObjectId(callerId) },
                    { 'callee.user': new ObjectId(calleeId) },
                ],
            }
        );

        if (!result.matchedCount) {
            console.warn(`syncChatCallPermissions — no chat found for chatId=${chatId} caller=${callerId} callee=${calleeId}`);
        }
    }
}

module.exports = CallService;
