
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
 
const { UserService, ContactService, ChatService, CallService } = require('../../services'); 
const utils = require('../../utils');
const { getChatService } = require('../services');
const { getAgenda } = require('../../startup/agenda');
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
            await getAgenda().now('push:connection-request', { request: res.request });
        }
        cb({ request: res.request });
    } catch (ex) {
        console.error('Error while sending connection requests', ex);
        cb(ex);
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

        const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
        const toUser = await UserModel.findById(toId).lean();

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            this.to(toId).emit('connection request response', { 
                from: fromUser, 
                request: res.request, 
                response,
                status: 'accepted'
            });
        } else {
            if (toUser) {
                await getAgenda().now('push:connection-request-response', { 
                    from: fromUser, 
                    to: toUser, 
                    request: res.request, 
                    response
                });
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
            await getAgenda().now('push:connection-request-cancelled', { request: res.request });
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
            await getAgenda().now('push:undo-connection', { from: fromUser, request: res.request, to: toId });
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
        const requests = await userService.allRequests(this.user.id);
        cb(requests);
    } catch (ex) {
        cb(ex);
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
            await getAgenda().now('push:connection-request-reminder', { from: fromUser, request, to: toId });
        }
        cb({ request });
    } catch (ex) {
        console.error('Error while sending connection request reminder', ex);
        cb(ex);
    }
}