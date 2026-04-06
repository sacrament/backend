
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
            'undo friendship connection': undoFriendshipConnection,
            'check connection request':   checkConnectionRequest,
            'all connection requests':    allRequests,
            'connection request reminder': requestReminder,
            // ── Spec-compliant dot-notation event names ────────────────────────
            'user.sendConnectionRequest':    sendRequest,
            'user.cancellConnectionRequest': cancelRequest,
            'user.respondConnectionRequest': respondRequest,
            'user.undoFriendshipConnection': undoFriendshipConnection,
            'user.connectionRequestReminder': requestReminder,
            'user.allRequests':              allRequests,
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
            this.to(toId).emit('user.connectionRequest', { from: fromUser, request: res.request });
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

        const res = await userService.respondConnectionRequest(fromId, toId, response);

        const memberIsOnline = await chatSocketService.isUserConnected(toId);

        if (memberIsOnline) {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            this.to(toId).emit('user.connectionRequestResponse', { from: fromUser, request: res.request, response });
        } else {
            const fromUser = await UserModel.findById(fromId).lean().select(utils.userColumnsToShow());
            await getAgenda().now('push:connection-request-response', { from: fromUser, to: toId, request: res.request, response });
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
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
            this.to(toId).emit('user.connectionRequestCancelled', { from: fromUser, request: res.request });
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
            this.to(toId).emit('user.connectionRequestReminder', { from: fromUser, request });
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