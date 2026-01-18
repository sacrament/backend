const SMSService = require('../../external/twilio/sms.service');
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const ContentStorage = mongoose.model('ContentStorage');
const APIGateway = require('../../external/aws/api.gateway');

const UserRequestModel = require('../../../models/user.request').UserRequest;
const UserConnectStatus = require('../../../models/user.connect').UserConnectStatus;

const utils = require('../../../utils/index');
const _ = require('lodash');
const { conformsTo } = require('lodash');

class UserService {
    constructor(userModel) {
        this.model = userModel
    }

    newUser(json) {
        return new Promise((resolve, reject) => {
            // return resolve(json);
            /*
            id: { type: Number, default: null, index: true }, 
            name: { type: String, default: null, index: true },
            email: { type: String, default: null, index: true },
            phone: { type: String, default: null, index: true },
            imageUrl: { type: String, default: null },
            bio: { type: String, default: null },
            registeredOn: { type: Date, default: Date.now },
            updatedOn: { type: Date, default: null },
            facebookId: { type: String, default: null },
            lastLogin: { type: Date, default: null },
            status: { type: String, default: null },
            device: {
                token: { type: String, default: null },
                description: { type: String, default: null },
                type: { type: String,  default: null },
                updatedOn: { type: Date, default: null },
            },
            chatToken: { type: String, default: null },
            isPublic: { type: Boolean, default: false}
            */
            const user = new this.model;
            user.id = json.id;
            user.name = json.name;
            user.phone = json.phone;
            user.email = json.email;
            user.imageUrl = json.imageUrl;
            user.bio = json.bio;
            user.registeredOn = json.registeredOn;
            user.device = {
                token: json.device.token,
                type: json.device.type,
                description: json.device.description || null
            }

            // user.chatToken = json.chatToken;
            user.isPublic = json.isPublic;
            user.status = json.status;
            user.facebookId = json.facebookId;
            user.isPublic = json.isPublic;

            // this.model.findOneAndUpdate({id: json.id}, user, {upsert: true, new: true}).then((user) => {
            //     
            // }).catch(err => {
            //     reject(err);
            // });

            this.model.findOne({ id: json.id }).then(async exists => {
                if (exists) {
                    console.log(`Update user: ${exists._id} with id: ${json.id}`)

                    exists.name = json.name;
                    exists.imageUrl = json.imageUrl;
                    exists.bio = json.bio;
                    exists.updatedOn = Date();

                    await exists.save();

                    console.log(`Existing user updated at: ${Date()}`)

                    resolve({
                        title: "Existing user is updated",
                        user: user
                    });
                } else {
                    user.save(err => {
                        if (err) return reject(err);

                        console.log(`New user registered at: ${Date()}`)

                        resolve({
                            title: "New user is saved",
                            user: user
                        });
                    });
                }
            }).catch(err => {
                reject(err);
            });
        });
    }

    getChatById(chatId) {
        return null;
    }

    async getUserById(userId, select = false) {
        return new Promise((resolve, reject) => {
            if (select) {
                this.model.findOne({ "_id": userId }).lean().select('_id id name email phone imageUrl status device')
                    .then(user =>
                        resolve(user))
                    .catch(err => reject(err))
            } else {
                this.model.findOne({ "_id": userId }).lean()
                    .then(user =>
                        resolve(user))
                    .catch(err =>
                        reject(err))
            }
        });
    }

    async getUserByIntId(userId) {
        return new Promise((resolve, reject) => {
            this.model.findOne({ "id": userId }).select('_id id name email phone imageUrl status device').then(user => resolve(user)).catch(err => reject(err))
        });
    }

    getAllUsersFromMainDB() {
        return this.model.findAll({
            // limit: 10
        });
    }

    /**
     *
     * Get mongodb id
     * @param {*} users
     * @returns
     */
    getUserIds(users) {
        return new Promise((resolve, reject) => {
            this.model.find({ "id": { "$in": users } }, (err, users) => {
                if (err) return reject(err);

                if (users) {
                    const userIds = users.map(user => user._id.toString());
                    // console.log(userIds)

                    if (userIds.length == 1) {
                        return resolve(userIds[0])
                    }

                    resolve(userIds);
                }
            });
        });
    }

    /**
     *
     *
     * @param {*} userIds
     * @returns
     * @memberof UserService
     */
    async getUsersBy(userIds) {
        return new Promise((resolve, reject) => {
            this.model.find({ "_id": { "$in": userIds } })
                .select(utils.userColumnsToShow())
                .lean().then(users => {
                    resolve(users);
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     *
     *
     * @param {*} users
     * @returns
     * @memberof UserService
     */
    matchUserIds(users) {
        return new Promise((resolve, reject) => {
            this.model.find({ "id": { "$in": users } }, (err, users) => {
                if (err) return reject(err);

                if (users) {
                    const userIds = users.map(user => user = { mongoId: user._id.toString(), id: user.id });
                    // console.log(userIds) 

                    resolve(userIds);
                }
            });
        });
    }

    /**
     * Update user's device with new toeken
     *
     * @param {*} userId
     * @param {*} device
     * @returns
     * @memberof UserService
     */
    async updateDeviceToken(userId, deviceToken, deviceType) {
        console.log(`Update device token: ${deviceType}`);
        return new Promise((resolve, reject) => {
            const filter = { id: userId };
            const update = { $set: { 'device.token': deviceToken, 'device.type': deviceType, updatedOn: Date() } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .lean().then((user) => {
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('No device found for user'));
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     * Update voip token for device
     *
     * @param {*} userId
     * @param {*} deviceToken
     * @returns
     * @memberof UserService
     */
    async updateVoipDeviceToken(userId, deviceToken) {
        console.log(`Update device voip token`);
        return new Promise((resolve, reject) => {
            const filter = { id: userId };
            const date = Date();
            const update = { $set: { 'device.voipToken': deviceToken, updatedOn: date, 'device.updatedOn': date } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .lean().then((user) => {
                    if (user) {
                        console.log(`Device updated with voip token`);
                        resolve(user);
                    } else {
                        reject(new Error('VOIPTOKEN: No device found for user'));
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     * Verify users by the phone number
     *
     * @param {*} phones
     * @returns
     * @memberof UserService
     */
    async verifyUsersByPhone(phones) {
        console.log(`Verify users by phone`);
        return new Promise((resolve, reject) => {
            const phonesString = phones + ""
            const query = { $text: { $search: phonesString } };

            this.model.find(query).select('_id id name email phone imageUrl status')
                .lean().then((users) => {
                    // const mapPhones = phones.map(phone => phone); 
                    // const mapPhones = phones.map((item, i) => Object.assign({}, item, users[i]));

                    let result = [];

                    phones.forEach(phone => {
                        // const ph = item.user.originalPhone; 
                        let user = users.find(user => user.phone == phone);

                        let hasAccount = false;

                        if (user) {
                            if (typeof user === 'object') {
                                hasAccount = true
                            }
                        } else {
                            // user = phones[i]
                            user = phone
                            // console.log('no account') 
                        }

                        const u = {
                            user: user,
                            hasAccount: hasAccount
                        }

                        result.push(u);
                        // return Object.assign({}, phone, u)

                    });

                    if (result) {
                        resolve(result);
                    } else {
                        reject(new Error('No users found for the given list'));
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    };

    /**
     *
     *
     * @param {*} phones
     * @memberof UserService
     */
    async sendSMS(from, phones) {
        const user = await this.getUserByIntId(from);
        console.log(`Send users SMS`);

        return SMSService.send(user, phones);
    };

    /**
     *Enable user's device after login 
     *
     * @param {*} userId
     * @param {*} newDeviceToken
     * @returns
     * @memberof UserService
     */
    async enableDeviceForUser(userId, newDeviceToken) {
        console.log(`Activate device for user: ${userId}`);
        return new Promise((resolve, reject) => {
            const filter = { id: userId };
            const date = Date.now();
            const update = { $set: { 'device.isActive': true, 'device.token': newDeviceToken, 'device.updatedOn': date, updatedOn: date } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .lean().then((user) => {
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('No device found for user'));
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     *
     *
     * @param {*} userId
     * @returns
     * @memberof UserService
     */
    async disableUserDeviceFor(userId) {
        console.log(`Disable device for user: ${userId}`);
        return new Promise((resolve, reject) => {
            const filter = { id: userId };
            const update = { $set: { 'device.isActive': false, 'device.token': null, updatedOn: Date() } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .lean().then((user) => {
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('No device found for user'));
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     *
     *
     * @param {*} userId
     * @param {*} refreshToken
     * @returns
     * @memberof UserService
     */
    async saveRefreshToken(userId, refreshToken) {
        console.log(`Save refresh token for user: ${userId}`);
        return new Promise((resolve, reject) => {
            const filter = { id: userId };
            const date = Date.now();
            const update = { $set: { 'refreshToken': refreshToken, updatedOn: date } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .lean().then((user) => {
                    if (user) {
                        resolve(user);
                    } else {
                        reject(new Error('No user found'));
                    }
                }).catch(err => {
                    reject(err);
                });
        });
    }

    /**
     * Block users
     *
     * @param {*} users
     * @param {*} from
     * @param {*} reason
     * @param {*} description
     * @returns
     * @memberof UserService
     */
    async blockUsers(users, from, reason, description) {
        console.log(`block users: ${from}`);
        return new Promise(async (resolve, reject) => {
            // blocker: { type: Schema.Types.ObjectId, ref: "User" }, 
            // blocked : { type: Schema.Types.ObjectId, ref: "User" }, 
            // reason: { type: String, index: true, validate: true },
            // description: { type: String, default: null },
            // status: { type: String }, 
            // createdOn: { type: Date, default: Date.now },
            // updatedOn: { type: Date, default: null }

            const block = new this.model;
            block.blocker = from;
            block.reason = reason || "NO_REASON";
            block.description = description || "Blocked via chat"
            block.status = 'ACTIVE'

            const promises = users.map(async m => {
                //Wait for the response
                const member = m.user;
                block.blocked = member._id;
                block.blockedOriginalId = member.id;

                const res = await block.save();

                return res;
            });

            const result = await Promise.all(promises);
            resolve(result);

            console.log(`Result from ['BLOCK'} users]: ${result}`);
        });
    }

    /**
     * Unblock users
     *
     * @param {*} users
     * @param {*} from
     * @returns
     * @memberof UserService
     */
    async unblockUsers(users, from) {
        console.log(`unblock users: ${from}`);
        return new Promise(async (resolve, reject) => {

            const promises = users.map(async m => {
                //Wait for the response
                const memberId = m.user._id;

                const res = await this.model.findOneAndRemove({ blocker: from, blocked: memberId });
                return res;
            });

            const result = await Promise.all(promises);
            resolve(result);

            console.log(`Result from ['UNBLOCK'} users]: ${result}`);
        });
    }

    /**
     * Get all blocked users for user
     *
     * @param {*} userId
     * @returns
     * @memberof UserService
     */
    async getAllBlockedUsers(userId) {
        if (typeof userId === 'number') {
            try {
                const user = await UserModel.findOne({ "id": userId }).select('_id id name email phone imageUrl status device')
                userId = user._id;
            } catch (ex) {
                console.error(`Can't parse user id `)
                throw ex;
            }
        }

        console.log(`get all blocked users: ${userId}`);

        return new Promise(async (resolve, reject) => {
            const query = {
                $or: [{ blocker: userId }, { blocked: userId }]
            }
            this.model.find(query)
                .populate(
                    {
                        path: "blocker blocked",
                        select: '_id id name email phone imageUrl status'
                    }
                ).then(users => {
                    resolve(users);
                    console.log(`Result from ['ALL BLOCKED users]: ${users.length}`);
                }).catch(err => {
                    console.error(`error from ['ALL BLOCKED users]: ${err}`);
                    reject(err);
                });
        });
    }

    /**
     * Block a user
     *
     * @param {*} userId
     * @param {*} me
     * @param {*} reason
     * @param {*} description
     * @returns
     * @memberof UserService
     */
    async blockUser(userId, me, reason, description) {
        return new Promise(async (resolve, reject) => {
            try {
                let myId = me.userId;
                let user;
                if (typeof myId === 'number') {
                    try {
                        user = await UserModel.findOne({ "id": myId }).select('_id id name email phone imageUrl status device')
                        myId = user._id;
                    } catch (ex) {
                        console.error(`Can't parse user id `)
                        throw ex;
                    }
                }

                let userIDString;
                let userBlocked;
                if (typeof userId === 'number') {
                    try {
                        userBlocked = await UserModel.findOne({ "id": userId }).select('_id id name email phone imageUrl status device')
                        userIDString = userBlocked._id;
                    } catch (ex) {
                        console.error(`Can't parse user id `)
                        throw ex;
                    }
                }

                this.model.findOne({ blocker: myId, blocked: userIDString }).then(blockExists => {
                    if (blockExists) {
                        console.log(`Block for user: ${userId} exists from blocker: ${me.userId}`);
                    } else {
                        console.log(`Block for user: ${userId} does not exists from blocker: ${me.userId}. Storing`);
                        const block = new this.model;
                        block.blocker = myId;
                        block.reason = reason || "NO_REASON";
                        block.description = description || "Misbehaving"
                        block.status = 'ACTIVE'

                        //Wait for the response 
                        block.blocked = userIDString;
                        block.blockedOriginalId = userId;

                        block.save();
                    }
                }).catch(err => {
                    console.log(`Error while fetching user blocked: ${err.message}`);
                })

                const apiGateway = new APIGateway();
                //Wait for the response 
                const res = await apiGateway.blockUser(userId, me.token);

                console.log(`Result from API ['BLOCK' user]: ${res}`);

                resolve({ blocked: true, blockedUser: userBlocked });

            } catch (ex) {
                console.error(`Error while unblocking a single user: ${userId}: ERROR: ${ex.message}`);
                reject({ blocked: false, error: ex.message });
            }
        });
    };

    /**
     * Unblock user
     *
     * @param {*} userId
     * @param {*} me
     * @returns
     * @memberof UserService
     */
    async unblockUser(userId, me) {
        return new Promise(async (resolve, reject) => {
            try {
                let myId = me.userId;
                let user;

                if (typeof myId === 'number') {
                    try {
                        user = await UserModel.findOne({ "id": myId }).select('_id id name email phone imageUrl status device')
                        myId = user._id;
                    } catch (ex) {
                        console.error(`Can't parse user id `)
                        throw ex;
                    }
                }

                let userIDString;
                let userUnblocked;
                if (typeof userId === 'number') {
                    try {
                        userUnblocked = await UserModel.findOne({ "id": userId }).select('_id id name email phone imageUrl status device')
                        userIDString = userUnblocked._id;
                    } catch (ex) {
                        console.error(`Can't parse user id `)
                        throw ex;
                    }
                }

                await this.model.findOneAndRemove({ blocker: myId, blocked: userIDString });

                const apiGateway = new APIGateway();
                //Wait for the response 
                const res = await apiGateway.unblockUser(userId, me.token);

                console.log(`Result from API ['UNBLOCK' user]: ${res}`);

                resolve({ unblocked: true, userUnblocked: userUnblocked })

            } catch (ex) {
                console.error(`Error while unblocking a single user: ${userId}: ERROR: ${ex.message}`);
                reject({ unblocked: false, error: ex.message });
            }
        });
    };

    /**
     * Get ALL the content for a single user
     *
     * @param {*} forUser
     * @returns
     * @memberof UserService
     */
    async getContentStorageFor(user) {
        if (typeof user === 'number') {
            try {
                const u = await UserModel.findOne({ "id": user }).select('_id id name email phone imageUrl status device')
                user = u._id;
            } catch (ex) {
                console.error(`Can't parse user id `)
                throw ex;
            }
        }

        return new Promise(async (resolve, reject) => {
            ContentStorage.find({ receiver: user })
                .populate(
                    {
                        path: "receiver from",
                        select: '_id id name email phone imageUrl status'
                    }
                ).populate(
                    {
                        path: "message",
                        select: '-isImported -importedOn -summary -replyTo -__v -uniqueId'
                    }
                ).then(res => {
                    if (res) {
                        resolve(res)
                        /// Delete now
                        ContentStorage.deleteMany({ receiver: user }).then(res => {
                            console.info(`ALl content storage for user deleted:`)
                        }).catch(err => {
                            console.error(`Error deleting all content storage for user: ${err.message}`)
                        });
                    }
                }).catch(err => {
                    reject(err);
                })
        });
    }

    /**
     * Get content by id
     *
     * @param {*} id
     * @returns
     * @memberof UserService
     */
    async getContentStorageBy(id) {
        return new Promise(async (resolve, reject) => {
            ContentStorage.findOne({ _id: id }).then(res => {
                resolve(res);
            }).catch(err => {
                reject(err);
            })
        });
    }

    async deleteMessageObjectBy(messageId) {
        return new Promise(async (resolve, reject) => {
            ContentStorage.findOneAndDelete({ message: messageId }).then(res => {
                resolve(true);
            }).catch(err => {
                reject(err);
            })
        });
    }

    async setContentStorageFor(user, from, action, data) {
        // return new Promise(async (resolve, reject) => {
        const cs = new ContentStorage();
        cs.receiver = user._id;
        cs.message = data.message || null;
        cs.chat = data.chat || null;
        cs.description = data.description || "Message deleted"
        cs.action = action
        cs.from = from.id;
        //Wait for the response  

        return await cs.save();
        // });
    }

    /*
    /-----------------------------------------------------------------------------------
    //                                  New Methods                                   //
    /-----------------------------------------------------------------------------------
    */

    /**
     * Send a connection request to someone
     *
     * @param {*} from
     * @param {*} to
     * @return {*} 
     * @memberof UserService
     */
    async sendConnectionRequest(from, to) {
        // create the user request model
        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).select('_id id')
            to = u._id.toString();
        }
        return new Promise((resolve, reject) => {
            UserRequestModel.findOne({ from: from, to: to, status: 'new' })
                .populate({
                    path: "to from",
                    select: utils.userColumnsToShow()
                })
                // .lean()
                .then(async request => {
                    if (request) {
                        request.howMany += 1;
                        request.updatedOn = Date.now();
                        request.status = 'new';

                        await request.save();

                        resolve({ title: 'Existing request updated', request: request._doc });
                    } else {
                        const userRequest = new UserRequestModel({
                            from: from,
                            to: to
                        });

                        await userRequest.save();

                        // let uRequest = userRequest._doc;

                        userRequest.populate( 
                            { 
                                path: 'from to', 
                                select: utils.userColumnsToShow()
                                // select: '_id id name email phone imageUrl status' 
                            }, (err, populatedRequest) => { 

                            resolve({ title: 'New request saved', request: populatedRequest._doc });

                            const ucs = new UserConnectStatus({
                                users: [from, to]
                            });

                            ucs.save((err) => {
                                if (err) return console.error('Error storing user connect status');

                                console.info('User connection status is stored succesfully');
                            })
                        });   
                    }
                }).catch(ex => {
                    reject(ex);
                });
        });
    }

    /**
     * Respond to connection request
     *
     * @param {*} from
     * @param {*} to
     * @param {*} response
     * @memberof UserService
     */
    async respondConnectionRequest(from, to, response) {
        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).select('_id id')
            to = u._id.toString();
        }
        return new Promise((resolve, reject) => { 
            UserRequestModel.findOne({ $or: [{ from: from, to: to }, { from: to, to: from }], status: "new" })
            .populate({
                path: "to from",
                select: utils.userColumnsToShow()
            })
            // .lean()
            .then(async request => {
                if (request) {
                    request.updatedOn = Date.now();
                    request.status = response;

                    await request.save();

                    resolve({ title: 'Existing request updated', request: request._doc });

                    UserConnectStatus.findOne({ users: { "$all": [from, to]}, status: 'unknown' }).then(async (ucs) => {
                        if (ucs) {
                            ucs.updatedOn = Date.now();
                            // ucs.reason = reason || null;
                            ucs.status = response == 'accepted' ? 'connected' : 'disconnected'

                            await ucs.save();

                            console.info('User connection status updated succesfully');
                        } else {
                            const ucs = new UserConnectStatus({
                                users: [form, to],
                                status: response == 'accepted' ? 'connected' : 'disconnected'
                            });

                            ucs.save((err) => {
                                if (err) return console.error('Error storing user connect status');

                                console.info('User connection status is stored succesfully');
                            })
                        }
                    });
                } else {
                    reject({ title: 'No Request found', request: null });
                }
            }).catch(ex => {
                reject(ex);
            });
        });
    }

    /**
     * Cancel an active request
     *
     * @param {*} from
     * @param {*} to
     * @memberof UserService
     */
    async cancelConnectionRequest(from, to) {
        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).select('_id id')
            to = u._id.toString();
        }

        return new Promise((resolve, reject) => {
            UserRequestModel.findOne({ from: from, to: to, status: 'new' })
            .populate({
                path: "to from",
                select: utils.userColumnsToShow()
            })
            // .lean()
            .then(async request => {
                if (request) {
                    request.updatedOn = Date.now();
                    request.status = 'cancelled';

                    await request.save();

                    resolve({ title: 'Request cancelled & updated', request: request._doc });

                    UserConnectStatus.findOne({ users: { "$all": [from, to] }, status: 'unknown' }).then(async (ucs) => {
                        if (ucs) {
                            ucs.updatedOn = Date.now();
                            // ucs.reason = reason;
                            ucs.status = 'disconnected';

                            await ucs.save
                        } else {
                            const ucs = new UserConnectStatus({
                                users: [form, to],
                                status: 'disconnected'
                            });

                            ucs.save((err) => {
                                if (err) return console.error('Error storing user connect status');

                                console.info('User connection status is stored succesfully');
                            })
                        }
                    });
                } else {
                    reject({ title: 'No Request found', request: null });
                }
            }).catch(ex => {
                reject(ex);
            });
        }); 
    }

    /**
     * Undo a friendship connection
     *
     * @param {*} from
     * @param {*} to
     * @param {*} reason
     * @memberof UserService
     */
    async undoFriendshipConnection(from, to, reason) {
        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).select('_id id')
            to = u._id.toString();
        }
        return new Promise((resolve, reject) => {
            UserRequestModel.findOne({ $or: [{ from: from, to: to }, { from: to, to: from }] })
            .populate({
                path: "to from",
                select: utils.userColumnsToShow()
            })
            // .lean()
            .then(async request => {
                if (request) {
                    request.updatedOn = Date.now();
                    request.status = 'disconnected';
                    request.reason = reason

                    await request.save();

                    resolve({ title: 'Request undone & updated', request: request._doc });

                    UserConnectStatus.findOne({ users: { "$all": [from, to], status: 'connected' } }).then(async (ucs) => {
                        if (ucs) {
                            ucs.updatedOn = Date.now();
                            ucs.reason = reason;
                            ucs.status = 'disconnected'

                            await ucs.save
                        } else {
                            const ucs = new UserConnectStatus({
                                users: [form, to],
                                status: 'disconnected'
                            });

                            ucs.save((err) => {
                                if (err) return console.error('Error storing user connect status');

                                console.info('User connection status is stored succesfully');
                            })
                        }
                    });
                } else {
                    reject({ title: 'No Request found', request: null });
                }
            }).catch(ex => {
                reject(ex);
            });
        });
    }

    /**
     * Get details for a connection request
     *
     * @param {*} from
     * @param {*} to
     * @return {*} 
     * @memberof UserService
     */
    async getConnectionRequest(from, to) {
        if (typeof to == 'number') {
            const u = await UserModel.findOne({ "id": to }).select('_id id')
            to = u._id.toString();
        }
        return new Promise(async (resolve, reject) => { 
            UserRequestModel.findOne({ $or: [{ from: from, to: to }, { from: to, to: from }], status: 'new' })
            .populate({
                path: "to from",
                select: utils.userColumnsToShow()
            })
            .lean()
            .then(request => { 
                resolve(request); 
            }).catch(ex => {
                reject(ex);
            });
        });
    }

    /**
     * All requests for user
     *
     * @param {*} userId
     * @return {*} 
     * @memberof UserService
     */
    async allRequests(userId) {
        return new Promise((resolve, reject) => {
            UserRequestModel.find({ to: userId, status: "new"})
            .populate({
                path: "to from",
                select: utils.userColumnsToShow()
            })
            .lean()
            .then((requests) => {
                resolve(requests);
            }).catch(err => {
                reject(err)
            });
        });
    }
    /**
     * Toggle Radar status
     *
     * @param {*} userId
     * @param {*} status
     * @return {*} 
     * @memberof UserService
     */
    async updateRadar(userId, status) {
        return new Promise((resolve, reject) => {

            const query = { _id: userId };
            const date = Date.now();
            const update = { $set: { 'radar': { show: status, updatedOn: date } } };

            UserModel.findOneAndUpdate(query, update, { new: true }) 
            .lean()
            .then((user) => {
                resolve(user);
            }).catch(err => {
                reject(err)
            });
        });
    }

    /**
     * Delete account
     *
     * @param {*} userId
     * @return {*} 
     * @memberof UserService
     */
     async deleteAccount(userId) {
        return new Promise((resolve, reject) => {
            // return resolve({ status: 'deleted', deletedUser: null });t
            const query = {
                'deleted.date': Date.now(),
                'deleted.reason': 'User initiated',
                'deleted.status': true
            }
            UserModel.findOneAndUpdate({ "_id": userId }, query, { new: true })
            .then(user => {
                if (user.nModified == 1) {
                    resolve({ status: 'deleted', deletedUser: user });
                } else {
                    reject({ status: 'not deleted' });
                }
            }).catch(err => {
                reject({ status: 'not deleted', error: err });
            });
        });
    }
}

module.exports = UserService;