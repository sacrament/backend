const { CallService, UserService } = require('../../services');
const { getChatService } = require('../services');
const VoipPushNotificationService = require('../../notifications/voip');
const pushNotificationService = require('../../notifications');

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
        const { requestId, userId: calleeIdRaw, chatId, mode, networkType } = data;

        const userService = new UserService();
        const callerObject = await resolveUserByAnyId(userService, this.user.id);
        if (!callerObject) {
            return ack({ error: 'Caller not found' });
        }

        const callerId = callerObject._id.toString();

        const calleeObject = await resolveUserByAnyId(userService, calleeIdRaw);
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

        if (isCalleeOnline) {
            this.to(calleeId).emit('call request', { requestId, from: callerObject, chatId, mode });
        } else {
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

        if (status === 'declined') {
            await callService.recordCallRequestResponse({ requestId, response: 'declined' });
            this.to(callerId).emit('call request response', { requestId, chatId: request.chatId, status: 'declined' });
            return ack({ success: true });
        }

        await callService.recordCallRequestResponse({ requestId, response: 'accepted' });

        await callService.syncChatCallPermissions(request.chatId, callerId, calleeId, mode);

        this.to(callerId).emit('call request response', {
            requestId,
            chatId: request.chatId,
            status: 'accepted',
            mode,
        });

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
 * Params: { callId, userId, mode, roomName }
 *
 * Emits "incoming call" to callee: { callId, roomName, mode, from }
 */
const initiateCall = async function(data, ack) {
    try {
        const { callId, userId: calleeIdRaw, mode, roomName } = data;
        const callerId = this.user.id;

        const userService = new UserService();
        const callerObject = await resolveUserByAnyId(userService, callerId);
        const calleeObject = await resolveUserByAnyId(userService, calleeIdRaw);

        if (!callerObject) {
            return ack({ error: 'Caller not found' });
        }

        if (!calleeObject) {
            return ack({ error: 'Callee not found' });
        }

        const calleeId = calleeObject._id.toString();
        const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);

        if (isCalleeOnline) {
            this.to(calleeId).emit('incoming call', { callId, roomName, mode, from: callerObject });
        } else {
            if (calleeObject.device?.type === 'ANDROID') {
                await pushNotificationService.incomingCall({ call: { sid: callId }, from: callerObject, to: calleeObject, mode, token: null });
            } else {
                const voipService = new VoipPushNotificationService();
                await voipService.incomingCall({ call: { sid: callId }, from: callerObject, to: calleeObject, mode, token: null });
            }
        }

        ack({ success: true, isCalleeOnline });
    } catch (ex) {
        console.error(`initiate call error: ${ex.message}`);
        ack({ error: ex.message });
    }
};

/**
 * Either party ends the active call.
 * Params: { callId, roomName }
 *
 * Looks up the call record to identify the other party, ends the Twilio room,
 * then emits "end call" to the other party or sends a push notification.
 */
const endCall = async function(data, ack) {
    try {
        const { callId, roomName } = data;
        const senderId = this.user.id;

        const callService = new CallService();
        const userService = new UserService();

        // Resolve the other party from call history
        const callRecord = await callService.getCall(callId);
        if (!callRecord) {
            return ack({ error: 'Call not found' });
        }

        const callerId = callRecord.from._id.toString();
        const calleeId = callRecord.to._id.toString();
        const otherPartyId = senderId === callerId ? calleeId : callerId;

        const endedCall = await callService.endCall(callId, calleeId, callerId);
        const senderObject = await resolveUserByAnyId(userService, senderId);
        if (!senderObject) {
            return ack({ error: 'Sender not found' });
        }
        const isOtherOnline = await chatSocketService.isUserConnected(otherPartyId);

        ack({ success: true, call: endedCall });

        if (isOtherOnline) {
            this.to(otherPartyId).emit('end call', { callId, roomName, from: senderObject });
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
            return ack({ error: 'Call request not approved yet' });
        }

        const callType = mode === 'video' ? 'video' : 'voice';
        const meta = { ipAddress, networkInfo: networkType || null };
        const { call, token } = await callService.createCallRoom(callerId, calleeId, callType, meta);

        await callService.markCallRequestConsumed(approvedRequest._id);

        ack({ success: true, callId: call.sid, roomName: call.uniqueName, token, mode });
    } catch (ex) {
        console.error(`create room error: ${ex.message}`);
        ack({ error: ex.message });
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

    let user = await userService.getUserById(idStr, true);
    if (user) {
        return user;
    }

    const numericId = Number(idStr);
    if (!Number.isInteger(numericId)) {
        return null;
    }

    const legacyUser = await userService.getUserByIntId(numericId);
    if (!legacyUser?._id) {
        return null;
    }

    user = await userService.getUserById(legacyUser._id.toString(), true);
    return user || legacyUser;
}
