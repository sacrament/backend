const { CallService, UserService } = require('../../services');
const { getChatService } = require('../services');
const VoipPushNotificationService = require('../../notifications/voip');
const pushNotificationService = require('../../notifications');
const mongoose = require('mongoose');

// Short-lived store for pending call requests (pre-acceptance, in-memory)
const pendingRequests = new Map();

let chatSocketService;

module.exports = class Calls {
    constructor() {
        chatSocketService = getChatService();

        this.handler = {
            // ── Legacy event names ────────────────────────────────────────────
            'send call request':    sendCallRequest,
            'respond call request': respondCallRequest,
            'cancel call request':  cancelCallRequest,
            'disable calls':  disableCalls,
            'call':                 initiateCall,
            'join room':            joinRoom,
            'end':                  endCall, 
            'create room':     createRoom,
        };
    }
};

/**
 * Caller signals intent to call another user.
 * Params: { requestId, userId, chatId, mode: "audio"|"video", networkType?: string }
 *
 * networkType is provided by the client (e.g. "5G", "4G", "LTE", "WiFi").
 * ipAddress is captured server-side from the socket handshake.
 */
const sendCallRequest = async function(data, ack) {
    try {
        const { requestId, to, chatId, mode, networkType } = data;

        const userService = new UserService();
        const callerObject = await resolveUserByAnyId(userService, this.user.id);
        if (!callerObject) {
            return ack({ error: 'Caller not found' });
        }

        const callerId = callerObject._id.toString();

        const calleeObject = await resolveUserByAnyId(userService, to);
        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }

        const calleeId = calleeObject._id.toString();

        // Capture caller IP from socket handshake (falls back through proxy headers)
        const ipAddress =
            this.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            this.handshake.address ||
            null;

        const callService = new CallService();
        const callRequest = await callService.saveCallRequest({
            requestId,
            from: callerId,
            to: calleeId,
            chatId,
            mode,
            ipAddress,
            networkInfo: networkType || null,
        });

        pendingRequests.set(requestId, { callerId, calleeId, chatId, mode, ipAddress, networkInfo: networkType || null, callRequestId: callRequest._id.toString() });

        const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);
        const isCalleeBackgrounded = calleeObject.device?.state === 'background';

        if (isCalleeOnline) {
            this.to(calleeId).emit('call request', { requestId, from: callerObject, chatId, mode });
        }

        // Send push when callee is offline, or when online but app is backgrounded
        // (backgrounded apps may not surface socket events on iOS)
        if (!isCalleeOnline || isCalleeBackgrounded) {
            await pushNotificationService.callRequest({
                requestId,
                chatId,
                from: callerObject,
                to: calleeObject,
                mode,
            });
        }

        ack({ success: true });
    } catch (ex) {
        console.error(`send call request error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Callee accepts or declines a pending call request.
 * Params: { requestId, status: "accepted"|"declined" }
 *
 * On accept: creates Twilio room, issues tokens to both parties.
 *   - Ack to callee: { callId, roomName, token, mode }
 *   - Emit "call request accepted" to caller: { callId, roomName, token, mode }
 * On decline:
 *   - Emit "call request declined" to caller: { requestId }
 */
const respondCallRequest = async function(data, ack) {
    try {
        const { requestId, status } = data;
        const userService = new UserService();
        const calleeObject = await resolveUserByAnyId(userService, this.user.id);
        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }
        const calleeId = calleeObject._id.toString();

        const request = pendingRequests.get(requestId);
        if (!request) {
            return ack({ error: 'Call request not found or expired' });
        }

        const { callerId, mode } = request;
        pendingRequests.delete(requestId);

        const callService = new CallService();
        const isCallerOnline = await chatSocketService.isUserConnected(callerId);

        if (status === 'declined') {
            await callService.recordCallRequestResponse({ requestId, response: 'declined' });

            if (isCallerOnline) {
                this.to(callerId).emit('call request response', { requestId, chatId: request.chatId, status: 'declined' });
            } else {
                const callerObject = await resolveUserByAnyId(userService, callerId);
                if (callerObject) {
                    await pushNotificationService.callRequestResponse({
                        requestId,
                        chatId: request.chatId,
                        from: calleeObject,
                        to: callerObject,
                        mode,
                        status: 'declined',
                    });
                }
            }
            return ack({ success: true });
        }

        await callService.recordCallRequestResponse({ requestId, response: 'accepted' });

        await callService.syncChatCallPermissions(request.chatId, callerId, calleeId, mode);

        if (isCallerOnline) {
            this.to(callerId).emit('call request response', {
                requestId,
                chatId: request.chatId,
                status: 'accepted',
                mode,
            });
        } else {
            const callerObject = await resolveUserByAnyId(userService, callerId);
            if (callerObject) {
                await pushNotificationService.callRequestResponse({
                    requestId,
                    chatId: request.chatId,
                    from: calleeObject,
                    to: callerObject,
                    mode,
                    status: 'accepted',
                });
            }
        }

        ack({
            success: true,
            requestId,
            chatId: request.chatId,
            status: 'accepted',
            mode,
        });
    } catch (ex) {
        console.error(`respond call request error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Caller cancels a pending call request before the callee responds.
 * Params: { requestId }
 */
const cancelCallRequest = async function(data, ack) {
    const callback = typeof ack === 'function'
        ? ack
        : (typeof data === 'function' ? data : null);

    const payload = (data && typeof data === 'object' && !Array.isArray(data))
        ? data
        : {};

    try {
        const { requestId } = payload;

        if (!requestId) {
            if (callback) callback({ error: 'requestId is required' });
            return;
        }

        const request = pendingRequests.get(requestId);

        if (request) {
            this.to(request.calleeId).emit('call request cancelled', { requestId, chatId: request.chatId });
            pendingRequests.delete(requestId);

            const callService = new CallService();
            await callService.recordCallRequestResponse({ requestId, response: 'cancelled' }).catch(() => {});
        }

        if (callback) callback({ success: true });
    } catch (ex) {
        console.error(`cancel call request error: ${ex.message}`);
        if (callback) callback({ error: ex.message });
    }
};

/**
 * Caller is in the Twilio room and signals the callee to join.
 * Params: { callId, userId, mode, roomName, requestId }
 *
 * callId    — server-issued MongoDB _id returned in `create room` ack.
 * userId    — recipient user id.
 * roomName  — Twilio room SID from `create room` ack (unused server-side, kept for client symmetry).
 * requestId — same requestId sent to `create room`.
 *
 * Emits "incoming call" to callee: { callId (room SID), callHistoryId, roomName, mode, from }
 */
const initiateCall = async function(data, ack) {
    try {
        const { callId: callHistoryId, userId: calleeIdRaw, mode, roomName } = data;
        const callerId = this.user.id;

        if (!callHistoryId) {
            return ack({ error: 'callId is required' });
        }

        const callService = new CallService();
        const userService = new UserService();

        // Resolve call record server-side.
        // If the value is a valid ObjectId use the DB _id lookup (preferred);
        // otherwise treat it as a Twilio room SID (legacy / client sent wrong field).
        const isObjectId = mongoose.Types.ObjectId.isValid(callHistoryId) && String(new mongoose.Types.ObjectId(callHistoryId)) === callHistoryId;
        const callRecord = isObjectId
            ? await callService.getCallById(callHistoryId)
            : await callService.getCall(callHistoryId);
        if (!callRecord) {
            return ack({ error: 'Call not found' });
        }

        // Guard: only the caller (from) may initiate
        const resolvedCallId = callRecord.roomId;
        const resolvedCallerId = callRecord.from._id.toString();
        const resolvedCalleeId = callRecord.to._id.toString();

        const callerObject = await resolveUserByAnyId(userService, callerId);
        if (!callerObject || callerObject._id.toString() !== resolvedCallerId) {
            return ack({ error: 'Caller not found or unauthorised' });
        }

        const calleeObject = await resolveUserByAnyId(userService, calleeIdRaw || resolvedCalleeId);
        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }

        const calleeId = calleeObject._id.toString();
        const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);

        // Generate a Twilio access token for the receiver so they can join immediately
        const { token: receiverToken } = await callService.call(resolvedCallId, resolvedCallerId, calleeId);

        const callPayload = {
            from:  callerObject,
            mode,
            token: receiverToken,
            call: {
                _id: callRecord._id.toString(),
                sid: resolvedCallId,
            },
        };

        if (isCalleeOnline) {
            this.to(calleeId).emit('incoming call', callPayload);
        } else {
            const notifPayload = { call: { sid: resolvedCallId }, from: callerObject, to: calleeObject, mode, token: receiverToken };
            if (calleeObject.device?.type === 'ANDROID') {
                await pushNotificationService.incomingCall(notifPayload);
            } else {
                const voipService = new VoipPushNotificationService();
                await voipService.incomingCall(notifPayload);
            }
        }

        ack({ success: true, isCalleeOnline, callId: resolvedCallId });
    } catch (ex) {
        console.error(`initiate call error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Either party ends the active call.
 * Params: { callId, roomName }
 *
 * callId   — server-issued MongoDB _id (from `create room` ack, patched onto the call object).
 * roomName — Twilio room SID, used as fallback if callId lookup yields nothing.
 *
 * Looks up the call record to identify the other party, ends the Twilio room,
 * then emits "end call" to the other party or sends a push notification.
 */
const endCall = async function(data, ack) {
    try {
        const { callId: callHistoryId, roomName } = data;
        const senderId = this.user.id;

        const callService = new CallService();
        const userService = new UserService();

        // Prefer server-issued DB id; fall back to treating roomName as Twilio room SID
        const isObjectId = callHistoryId && mongoose.Types.ObjectId.isValid(callHistoryId) && String(new mongoose.Types.ObjectId(callHistoryId)) === callHistoryId;
        const callRecord = isObjectId
            ? await callService.getCallById(callHistoryId)
            : await callService.getCall(callHistoryId || roomName);

        if (!callRecord) {
            return ack({ error: 'Call not found' });
        }

        // Use the server-resolved room SID for all subsequent operations
        const resolvedRoomSid = callRecord.roomId;

        const callerId = callRecord.from._id.toString();
        const calleeId = callRecord.to._id.toString();
        const otherPartyId = senderId === callerId ? calleeId : callerId;

        const endedCall = await callService.endCall(resolvedRoomSid, calleeId, callerId);
        const senderObject = await resolveUserByAnyId(userService, senderId);
        if (!senderObject) {
            return ack({ error: 'Sender not found' });
        }
        const isOtherOnline = await chatSocketService.isUserConnected(otherPartyId);

        ack({ success: true, call: endedCall });

        if (isOtherOnline) {
            this.to(otherPartyId).emit('end call', {
                from: senderObject,
                call: {
                    _id: callRecord._id.toString(),
                    sid: resolvedRoomSid,
                },
            });
        } else {
            const otherObject = await resolveUserByAnyId(userService, otherPartyId);
            if (!otherObject) {
                return;
            }
            if (otherObject.device?.type === 'ANDROID') {
                await pushNotificationService.endCall({ call: endedCall, from: senderObject, to: otherObject, mode: callRecord.callType });
            } else {
                const voipService = new VoipPushNotificationService();
                await voipService.endCall({ call: endedCall, from: senderObject, to: otherObject, mode: callRecord.callType });
            }
        }
    } catch (ex) {
        console.error(`end call error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Receiver joins an existing Twilio room after receiving an "incoming call" event.
 * Params: { callId, roomName, mode }
 *
 * Issues a Twilio access token for the callee and emits "call joined" to the caller.
 * Ack: { callId, roomName, token, mode }
 */
const joinRoom = async function(data, ack) {
    try {
        const { callId, roomName, mode } = data;
        const calleeId = this.user.id;

        if (!callId) {
            return ack({ error: 'callId is required' });
        }

        const callService = new CallService();
        const userService = new UserService();

        const calleeObject = await resolveUserByAnyId(userService, calleeId);
        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }

        // Fetch room & issue token for the callee (records incoming call history)
        const { call, token } = await callService.call(callId, null, calleeObject._id.toString());

        // Notify the caller that the receiver has joined
        const callRecord = await callService.getCall(callId);
        if (callRecord) {
            const callerId = callRecord.from._id.toString();
            this.to(callerId).emit('call joined', {
                callId,
                roomName: call.uniqueName || roomName,
                mode,
                joinedBy: calleeObject._id.toString(),
            });
        }

        ack({ success: true, callId, roomName: call.uniqueName || roomName, token, mode });
    } catch (ex) {
        console.error(`join room error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Create a Twilio room on behalf of the caller after an accepted call request.
 * Params: { userId, requestId } — the other party's userId and approved request id
 * Ack: { callId, roomName, token, mode }
 */
const createRoom = async function(data, ack) {
    try {
        const { userId: calleeIdRaw, mode = 'audio', networkType, requestId, chatId } = data;

        if (!requestId) {
            return ack({ error: 'requestId is required' });
        }

        const userService = new UserService();
        const callerObject = await resolveUserByAnyId(userService, this.user.id);
        const calleeObject = await resolveUserByAnyId(userService, calleeIdRaw);

        if (!callerObject) {
            return ack({ error: 'Caller not found' });
        }

        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }

        const callerId = callerObject._id.toString();
        const calleeId = calleeObject._id.toString();

        const ipAddress =
            this.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            this.handshake.address ||
            null;

        const callService = new CallService();

        const approvedRequest = await callService.getAcceptedCallRequest({
            requestId,
            from: callerId,
            to: calleeId,
            chatId,
        });

        if (!approvedRequest) {
            return ack({ error: 'Call request not approved yet', success: false });
        }

        const callType = mode === 'video' ? 'video' : 'voice';
        const meta = { ipAddress, networkInfo: networkType || null };

        // ── Busy check ────────────────────────────────────────────────────────
        // If the callee is already on an active call, reject immediately.
        const calleeIsBusy = await callService.isUserInActiveCall(calleeId);
        if (calleeIsBusy) {
            const busyRecord = await callService.recordBusyRejection({
                from:        callerId,
                to:          calleeId,
                callType,
                ipAddress:   meta.ipAddress,
                networkInfo: meta.networkInfo,
            });

            // Tell the caller the line is busy
            ack({ success: false, busy: true, error: 'User is busy on another call' });

            // Notify the callee so they see the missed call in their history
            const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);
            if (isCalleeOnline) {
                this.to(calleeId).emit('call missed', {
                    from: callerObject,
                    call: { _id: busyRecord._id.toString() },
                });
            }

            return;
        }
        // ─────────────────────────────────────────────────────────────────────

        const { call, token, callHistoryId } = await callService.createCallRoom(callerId, calleeId, callType, meta);

        ack({
            success: true,
            token,
            call: {
                _id: callHistoryId,
                sid: call.sid,
            },
        });
    } catch (ex) {
        console.error(`create room error: ${ex.message}`);
        ack({ error: ex.message, success: false });
    }
};

/**
 * Revoke call and video permissions for a user in a chat.
 * Params: { chatId, userId, requestId? }
 *
 * Emits "calls disabled" to the affected user if they are online.
 */
const disableCalls = async function(data, ack) {
    try {
        const { chatId, userId: targetUserIdRaw, requestId } = data;

        if (!chatId || !targetUserIdRaw) {
            return ack({ error: 'chatId and userId are required' });
        }

        const userService = new UserService();
        const targetUser = await resolveUserByAnyId(userService, targetUserIdRaw);
        if (!targetUser) {
            return ack({ error: 'User not found' });
        }

        const targetUserId = targetUser._id.toString();
        const requesterId = this.user.id;

        const callService = new CallService();
        await callService.revokeCallPermission({ chatId, targetUserId, requestId });

        const isTargetOnline = await chatSocketService.isUserConnected(targetUserId);
        if (isTargetOnline) {
            this.to(targetUserId).emit('calls disabled', {
                requestId,
                requestor: requesterId,
                requestee: targetUserId,
            });
        }

        ack({ success: true });
    } catch (ex) {
        console.error(`disable calls error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

async function resolveUserByAnyId(userService, rawId) {
    if (rawId === null || rawId === undefined) {
        return null;
    }

    const idStr = rawId.toString();

    // Only attempt ObjectId lookup when the string is a valid 24-char hex ObjectId;
    // otherwise Mongoose throws a CastError and the integer-ID fallback is never reached.
    if (mongoose.Types.ObjectId.isValid(idStr)) {
        const user = await userService.getUserById(idStr, true);
        if (user) {
            return user;
        }
    }

    const numericId = Number(idStr);
    if (!Number.isInteger(numericId)) {
        return null;
    }

    const legacyUser = await userService.getUserByIntId(numericId);
    if (!legacyUser?._id) {
        return null;
    }

    const user = await userService.getUserById(legacyUser._id.toString(), true);
    return user || legacyUser;
}
