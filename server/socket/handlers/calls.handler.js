const { CallService, UserService } = require('../../services');
const { getChatService } = require('../services');
const VoipPushNotificationService = require('../../notifications/voip');
const PushNotificationService = require('../../notifications');

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
            'call':                 initiateCall,
            'end':                  endCall,
            // ── Spec-compliant dot-notation event names ────────────────────────
            'call.sendRequest':    sendCallRequest,
            'call.respondRequest': respondCallRequest,
            'call.cancelRequest':  cancelCallRequest,
            'call.initiateCall':   initiateCall,
            'call.end':            endCall,
            'call.createRoom':     createRoom,
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
        const { requestId, userId: calleeId, chatId, mode, networkType } = data;
        const callerId = this.user.id;
        const callType = mode === 'video' ? 'video' : 'voice';

        // Capture caller IP from socket handshake (falls back through proxy headers)
        const ipAddress =
            this.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            this.handshake.address ||
            null;

        const callService = new CallService();
        const pendingCall = await callService.recordPendingCall({
            from: callerId,
            to: calleeId,
            callType,
            ipAddress,
            networkInfo: networkType || null
        });

        pendingRequests.set(requestId, { callerId, calleeId, chatId, mode, ipAddress, networkInfo: networkType || null, pendingCallId: pendingCall._id.toString() });

        const userService = new UserService();
        const callerObject = await userService.getUserById(callerId, true);
        const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);

        if (isCalleeOnline) {
            this.to(calleeId).emit('call.requestIncoming', { requestId, from: callerObject, chatId, mode });
        } else {
            const calleeObject = await userService.getUserById(calleeId, true);
            if (calleeObject.device?.type === 'ANDROID') {
                const pushService = new PushNotificationService();
                await pushService.incomingCall({ call: { requestId }, from: callerObject, to: calleeObject, mode, token: null });
            } else {
                const voipService = new VoipPushNotificationService();
                await voipService.incomingCall({ call: { requestId }, from: callerObject, to: calleeObject, mode, token: null });
            }
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
        const calleeId = this.user.id;

        const request = pendingRequests.get(requestId);
        if (!request) {
            return ack({ error: 'Call request not found or expired' });
        }

        const { callerId, mode, ipAddress, networkInfo, pendingCallId } = request;
        pendingRequests.delete(requestId);

        const callService = new CallService();

        if (status === 'declined') {
            if (pendingCallId) {
                await callService.updateCallStatusById(pendingCallId, 'rejected').catch(() => {});
            }
            this.to(callerId).emit('call.requestResponse', { requestId, chatId: request.chatId, status: 'declined' });
            return ack({ success: true });
        }

        // Accepted — create Twilio room; token returned is for the caller
        const callType = mode === 'video' ? 'video' : 'voice';
        const meta = { ipAddress, networkInfo };
        const { call, token: callerToken } = await callService.createCallRoom(callerId, calleeId, callType, meta);

        // Generate a separate token for the callee
        const { jwt: calleeToken } = await callService.getAccessToken(calleeId);

        this.to(callerId).emit('call.requestResponse', {
            requestId,
            chatId: request.chatId,
            status: 'accepted',
            callId: call.sid,
            roomName: call.uniqueName,
            token: callerToken,
            mode,
        });

        ack({
            success: true,
            callId: call.sid,
            roomName: call.uniqueName,
            token: calleeToken,
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
    try {
        const { requestId } = data;
        const request = pendingRequests.get(requestId);

        if (request) {
            this.to(request.calleeId).emit('call.requestCancelled', { requestId, chatId: request.chatId });
            pendingRequests.delete(requestId);

            // Mark the pending DB record as missed (caller cancelled before callee responded)
            if (request.pendingCallId) {
                const callService = new CallService();
                await callService.markCallAsMissed(request.pendingCallId).catch(() => {});
            }
        }

        ack({ success: true });
    } catch (ex) {
        console.error(`cancel call request error: ${ex.message}`);
        ack({ error: ex.message });
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
        const { callId, userId: calleeId, mode, roomName } = data;
        const callerId = this.user.id;

        const userService = new UserService();
        const callerObject = await userService.getUserById(callerId, true);
        const isCalleeOnline = await chatSocketService.isUserConnected(calleeId);

        if (isCalleeOnline) {
            this.to(calleeId).emit('call.incoming', { callId, roomName, mode, from: callerObject });
        } else {
            const calleeObject = await userService.getUserById(calleeId, true);
            if (calleeObject.device?.type === 'ANDROID') {
                const pushService = new PushNotificationService();
                await pushService.incomingCall({ call: { sid: callId }, from: callerObject, to: calleeObject, mode, token: null });
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
        const senderObject = await userService.getUserById(senderId, true);
        const isOtherOnline = await chatSocketService.isUserConnected(otherPartyId);

        ack({ success: true, call: endedCall });

        if (isOtherOnline) {
            this.to(otherPartyId).emit('call.ended', { callId, roomName, from: senderObject });
        } else {
            const otherObject = await userService.getUserById(otherPartyId, true);
            if (otherObject.device?.type === 'ANDROID') {
                const pushService = new PushNotificationService();
                await pushService.endCall({ call: endedCall, from: senderObject, to: otherObject, mode: callRecord.callType });
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
 * Create a Twilio room on behalf of the caller without a prior request/response handshake.
 * Params: { userId } — the other party's userId
 * Ack: { callId, roomName, token, mode }
 */
const createRoom = async function(data, ack) {
    try {
        const { userId: calleeId, mode = 'audio', networkType } = data;
        const callerId = this.user.id;

        const ipAddress =
            this.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            this.handshake.address ||
            null;

        const callService = new CallService();
        const callType = mode === 'video' ? 'video' : 'voice';
        const meta = { ipAddress, networkInfo: networkType || null };
        const { call, token } = await callService.createCallRoom(callerId, calleeId, callType, meta);

        ack({ success: true, callId: call.sid, roomName: call.uniqueName, token, mode });
    } catch (ex) {
        console.error(`create room error: ${ex.message}`);
        ack({ error: ex.message });
    }
};
