
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
 
const { UserService, ContactService, ChatService, CallService } = require('../../services'); 
const utils = require('../../utils');
const { getChatService } = require('../services');
const PushNotificationService = require('../../notifications');
 

const chatSocketService = getChatService();
module.exports = class User {
    constructor(io) { 
        this.handler = {
            'store contacts': storeContacts,
            'remove contact': removeContact,
            'edit contact': editMyContact,
            'send request': sendRequest,
            'respond request': respondRequest,
            'cancell request': cancelRequest,
            'undo friendship connection': undoFriendshipConnection,
            'check connection request': checkConnectionRequest,
            "all connection requests": allRequests,
            "connection request reminder": requestReminder
        };
    };
}

/**
 * Store user's contacts
 *
 * @param {*} data
 * @param {*} cb
 */
const storeContacts = async function (data, cb) {
    const from = this.user.id;
    const contacts = data.contacts;

    const contactService = new ContactService(UserModel);
    contactService.storeContacts(contacts, from).then(user => {
        cb(user);
    }).catch(error => {
        cb(error);
    })
}

/**
 * Remove a contact from the list
 *
 * @param {*} data
 * @param {*} cb
 */
const removeContact = async function (data, cb) {
    const from = this.user.id;
    const contact = data.contact;

    const contactService = new ContactService(UserModel);
    contactService.remove(contact, from).then(user => {
        cb(user);
    }).catch(error => {
        cb(error);
    })
}

/**
 * Edit a contact from my list
 *
 * @param {*} data
 * @param {*} cb
 */
const editMyContact = async function (data, cb) {
    const from = this.user.id;
    const contact = data.contact;

    const contactService = new ContactService(UserModel);
    contactService.edit(contact, from).then(user => {
        cb(user);
    }).catch(error => {
        cb(error);
    });
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
        let from = this.user.id;
        let to = data.to;

        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).lean().select(utils.userColumnsToShow())
            to = u;
        }

        const toUser = to._id.toString();

        const userService = new UserService(UserModel);
        const res = await userService.sendConnectionRequest(from, toUser);

        //TODO: CHeck if the user has blocked you prior to this
        if (typeof from == 'string') {
            let u = await UserModel.findOne({ "_id": from }).lean().select(utils.userColumnsToShow())
            // delete u.requests;
            from = u;
        }

        const memberIsOnline = await chatSocketService.isUserConnected(toUser);

        if (memberIsOnline) {
            this.to(toUser).emit('new connection request', { from: from, request: res.request });
        } else {
            /// Offline people. Send a push notification 

            const pushNotification = new PushNotificationService();
            await pushNotification.newConnectionRequest(res.request)
        }
        cb({ request: res.request });
    } catch (ex) {
        console.error('Error while sending connection requests')
        cb(ex);
    }
}

/**
 * Respond to a connection request
 *
 * @param {*} data
 * @param {*} cb
 */
const respondRequest = async function (data, cb) {
    try {
        let from = this.user.id;
        let to = data.to;
        const response = data.response;

        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).lean().select(utils.userColumnsToShow())
            to = u;
        }

        const toUser = to._id.toString();

        const userService = new UserService(UserModel);
        const res = await userService.respondConnectionRequest(from, toUser, response);

        //TODO: CHeck if the user has blocked you prior to this

        if (typeof from == 'string') {
            let u = await UserModel.findOne({ "_id": from }).lean().select(utils.userColumnsToShow())
            // delete u.requests;
            from = u;
        }

        const memberIsOnline = await chatSocketService.isUserConnected(toUser);

        if (memberIsOnline) {
            // const unreadMessages = await chatService.countUnreadMessagesForChat(chat._id, to)  
            // Send the message to online users
            this.to(toUser).emit('connection request response', { response: response, from: from, request: res.request });
        } else {
            /// Offline people. Send a push notification 
            // offlineReceivers.push(member); 

            const pushNotification = new PushNotificationService();
            await pushNotification.respondConnectionRequest(from, to, res.request, response)
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
    }
}

/**
 * Cancel request
 *
 * @param {*} data
 * @param {*} cb
 */
const cancelRequest = async function (data, cb) {
    try {
        let from = this.user.id;
        let to = data.to;

        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).lean().select(utils.userColumnsToShow())
            to = u;
        }

        const toUser = to._id.toString();

        const userService = new UserService(UserModel);
        const res = await userService.cancelConnectionRequest(from, toUser);

        //TODO: CHeck if the user has blocked you prior to this

        if (typeof from == 'string') {
            let u = await UserModel.findOne({ "_id": from }).lean().select(utils.userColumnsToShow())
            // delete u.requests;
            from = u;
        }

        const memberIsOnline = await chatSocketService.isUserConnected(toUser);

        if (memberIsOnline) {
            // const unreadMessages = await chatService.countUnreadMessagesForChat(chat._id, to)  
            // Send the message to online users
            this.to(toUser).emit('connection request cancelled', { from: from, request: res.request });
        } else {
            /// Offline people. Send a push notification 
            const pushNotification = new PushNotificationService();
            await pushNotification.cancellConnectionRequest(res.request);
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
    }
}

/**
 * Undo a frinedhsip connection
 *
 * @param {*} data
 * @param {*} cb
 */
const undoFriendshipConnection = async function (data, cb) {
    try {
        let from = this.user.id;
        let to = data.to;
        const reason = data.reason;

        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).lean().select(utils.userColumnsToShow())
            to = u;
        }

        const toUser = to._id.toString();

        const userService = new UserService(UserModel);
        const res = await userService.undoFriendshipConnection(from, toUser, reason);

        //TODO: CHeck if the user has blocked you prior to this

        if (typeof from == 'string') {
            let u = await UserModel.findOne({ "_id": from }).lean().select(utils.userColumnsToShow())
            // delete u.requests;
            from = u;
        }

        const memberIsOnline = await chatSocketService.isUserConnected(toUser);

        if (memberIsOnline) {
            // const unreadMessages = await chatService.countUnreadMessagesForChat(chat._id, to)  
            // Send the message to online users
            this.to(toUser).emit('undo friendship connection', { from: from, request: res.request });
        } else {
            /// Offline people. Send a push notification 
            const pushNotification = new PushNotificationService();
            await pushNotification.undoConnectionFriendship(from, res.request, to);
        }
        cb({ request: res.request });
    } catch (ex) {
        cb(ex);
    }
}

const checkConnectionRequest = async function (data, cb) {
    try {
        const from = this.user.id;
        const to = data.to;

        const userService = new UserService(UserModel);
        const request = await userService.getConnectionRequest(from, to);
        cb(request);
    } catch (ex) {
        cb(ex);
    }
}

const allRequests = async function (cb) {
    try {
        const from = this.user.id;
        const userService = new UserService(UserModel);
        const requests = await userService.allRequests(from)
        cb(requests);
    } catch (ex) {
        cb(ex);
    }
}

/**
 * REminder for non responded request
 *
 * @param {*} data
 * @param {*} cb
 */
const requestReminder = async function (data, cb) {
    try {
        let from = this.user.id;
        let to = data.to;

        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).lean().select(utils.userColumnsToShow())
            to = u
        }

        const toUser = to._id.toString();

        const userService = new UserService(UserModel);
        const request = await userService.getConnectionRequest(from, toUser);

        //TODO: CHeck if the user has blocked you prior to this
        if (typeof from == 'string') {
            let u = await UserModel.findOne({ "_id": from }).lean().select(utils.userColumnsToShow())
            // delete u.requests;
            from = u;
        }

        const memberIsOnline = await chatSocketService.isUserConnected(toUser);

        if (memberIsOnline) {
            this.to(toUser).emit('reminder for connection request', { from: from, request: request });
        } else {
            /// Offline people. Send a push notification  
            const pushNotification = new PushNotificationService();
            await pushNotification.reminderForConnectionRequest(from, request, to);
        }
        cb({ request: request });
    } catch (ex) {
        console.error('Error while sending connection request reminder')
        cb(ex);
    }
}