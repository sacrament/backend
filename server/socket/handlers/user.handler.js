
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
 
const { UserService, ContactService, ChatService, CallService } = require('../../services'); 
const utils = require('../../utils');
const { getChatService } = require('../services');
const push = require('../../notifications');
const userService = new UserService();

let chatSocketService;

module.exports = class User {
    constructor(io) {
        chatSocketService = getChatService();
        this.handler = {
            // ── Legacy event names ────────────────────────────────────────────
            'send request':               sendRequest,
            'respond request':            respondRequest,
            'cancel request':             cancelRequest,
            'cancell request':            cancelRequest, // iOS typo (double-l)
            'undo friendship connection': undoFriendshipConnection,
            'check connection request':   checkConnectionRequest,
            'all connection requests':    allRequests,
            'connection request reminder': requestReminder
                    };
    };
}

/** 
 ********************************
 *  CONNECTION REQUEST
 ********************************
 */

/**
 * Send connection request
 *
 * @param {*} data
 * @param {*} cb
 */
const sendRequest = async function (data, cb) {
    try {
        const fromId = this.user.id;
        const toId = data.to;

        const res = await userService.sendConnectionRequest(fromId, toId);

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            this.to(toId).emit('new connection request', { from: fromUser, request: res.request });
        } else {
            await push.newConnectionRequest(res.request);
        }
        cb({ request: res.request });
    } catch (ex) {
        console.error('Error while sending connection requests', ex);
        cb({ status: 'error', message: ex.message });
    }
}

const respondRequest = async function (data, cb) {
    try {
        const fromId = this.user.id;
        const toId = data.to;
        const response = data.response;

        // Validate input
        if (!toId || !response || !['accepted', 'declined'].includes(response)) {
            throw new Error('Invalid request: to and response (accepted/declined) are required');
        }

        const res = await userService.respondConnectionRequest(fromId, toId, response);

        if (!res || !res.request) {
            throw new Error('Failed to process connection request response');
        }

        // Skip notifying on a duplicate of an already processed response
        // (the iOS client calls both the socket and REST paths for reliability).
        if (!res.duplicate) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            const toUser = await UserModel.findById(toId).lean();

            const memberIsOnline = await chatSocketService.isUserConnected(toId);

            if (memberIsOnline) {
                this.to(toId).emit('connection request response', {
                    from: fromUser,
                    request: res.request,
                    response
                });
            } else if (response !== 'declined') {
                // Declined responses are silenced for now — do not push on decline.
                if (toUser) {
                    await push.respondConnectionRequest(fromUser, toUser, res.request, response);
                }
            }
        }

        // Return full response object with status
        cb({ 
            status: 'success',
            message: res.title,
            request: res.request,
            response: response,
            processedAt: Date.now()
        });
    } catch (ex) {
        console.error('Error responding to connection request:', ex);
        cb({
            status: 'error',
            error: ex.message,
            code: 'RESPOND_REQUEST_ERROR'
        });
    }
}

const cancelRequest = async function (data, cb) {
    try {
        const fromId = this.user.id;
        const toId = data.to;

        const res = await userService.cancelConnectionRequest(fromId, toId);

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            this.to(toId).emit('connection request cancelled', { from: fromUser, request: res.request });
        } else {
            await push.cancellConnectionRequest(res.request);
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
    }
}

const undoFriendshipConnection = async function (data, cb) {
    try {
        const fromId = this.user.id;
        const toId = data.to;
        const reason = data.reason;

        const res = await userService.undoFriendshipConnection(fromId, toId, reason);

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            this.to(toId).emit('undo friendship connection', { from: fromUser, request: res.request });
        } else {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            await push.undoConnectionFriendship(fromUser, res.request, toId);
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
    }
}

const checkConnectionRequest = async function (data, cb) {
    try {
        const request = await userService.getConnectionRequest(this.user.id, data.to);
        cb(request);
    } catch (ex) {
        cb(ex);
    }
}

const allRequests = async function (data, cb) {
    try {
        // The client expects a bare array of ConnectionRequest objects here;
        // connections are only returned by GET /users/connectionRequests.
        const { requests } = await userService.allRequests(this.user.id);
        cb(requests);
    } catch (ex) {
        cb({ status: 'error', message: ex.message });
    }
}

const requestReminder = async function (data, cb) {
    try {
        const fromId = this.user.id;
        const toId = data.to;

        const request = await userService.getConnectionRequest(fromId, toId);

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            this.to(toId).emit('connection request reminder', { from: fromUser, request });
        } else {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            await push.reminderForConnectionRequest(fromUser, request, toId);
        }
        cb({ request });
    } catch (ex) {
        console.error('Error while sending connection request reminder', ex);
        cb(ex);
    }
}