const ChatService = require('./chat.service'); 
const mongoose = require('mongoose');  
const ObjectId = mongoose.Types.ObjectId;
const Reaction = mongoose.model('Reaction');

const ChatModel = mongoose.model('Chat');  

const MediaModel = mongoose.model('Media');  

const UserService = require('../user/user.service');
const UserModel = mongoose.model('User');  
const utils = require('../../../utils/index');

class MessageServiceDB extends ChatService {
    /**
     *
     * Create a new Message object in Memory. This object is not stored/saved in db. It could be destroyed 
     * @param {*} message
     * @memberof MessageServiceDB
     */
    async create(data) {
        // Save the messageId;
        const message = new this.model;
        message.tempId = data.tempId;
        message.chatId = data.chatId;
        message.from = data.from;
        message.kind = data.type;
        message.sentOn = data.sentOn;

        if (data.replyTo) {
            message.replyTo = data.replyTo;
        }

        if (data.type == 'text') {
            message.content = data.content;
        } else if (data.type == 'share contact') {
            message.content = data.content;
            message.sharedContact = data.sharedContact;
        } else {
            const media = new MediaModel();
            media.from = data.from;
            media.type = data.type;
            media.name = data.mediaName;
            media.url = data.mediaUrl;
            media.message = message._id;
            media.thumbnail = data.thumbnail;
            message.media.push(media);

            // console.log(`Saving the media: ${Date.now()}`);

            // await media.save();

            // console.log(`Media is saved: ${Date.now()}`);
        }

        // console.log(`Setting the receivers: ${Date.now()}`);

        for (const to of data.members) {
            if (to.user._id.toString() == data.from) continue;
            const sent = {
                user: to.user._id,
                sent: data.sentOn
            };

            message.status.push(sent)
        }

        return message; 
    }

    /**
     * ~Generic message object. Used when new member is added to a group chat or something else 
     *
     * @param {*} title
     * @param {*} chatId
     * @param {*} from
     * @returns
     * @memberof MessageServiceDB
     */
    createGeneric(title, chatId, from, ) {  
        const message = new this.model;
        message.content = title;
        message.chatId = chatId; 
        message.from = from;
        message.kind = 'generic'; 
        message.sentOn = Date.now();
        message.status = [];

        // for (const to of data.members) {  
        //     if (to.user._id.toString() == data.from) continue;
        //     const sent = {
        //         user: to.user._id,
        //         sent: data.sentOn
        //     };
    
        //     message.status.push(sent)
        // }

        return message; 
    }

    /** 
     *
     * Save the message
     * @param {*} message
     * @memberof MessageServiceDB
     */
    async save(message, shouldPopulateFrom = true) {
        try {
            if (message.kind == 'image' || message.kind == 'video' || message.kind == 'audio' || message.kind == 'document') {
                const mediaExists = await MediaModel.countDocuments({message: message._id}).exec();
                if (mediaExists == 0) {
                    try { 
                        await MediaModel.create(message.media);
                        // console.log(`Media saved: ${Date()} s: messageid: ${message._id}`);
                    } catch (ex) {
                        console.error(`Error while saving new media: ${ex.message}`)
                        // return null;
                    } 
                } else {
                    // return null;
                    // console.log(`Skip media duplicate for message: ${message._id} at: ${Date()}`); 
                }
            }
    
            return new Promise((resolve, reject) => {
                message.save(err => {
                    if (err) {
                        //MARK: EIther create a new method for saving imported messages or replace rejec with resolve

                        console.log(`Message from: ${JSON.stringify(message, undefined, 14)}`);
                        console.error(`Error while saving new message: ${err.message}`)
                        
                        if (shouldPopulateFrom) { 
                            return reject(err);
                        } else {
                            resolve(err);
                        }
                    }

                    // console.log(`Message saved: ${Date()} with id: ${message._id}`);

                    ///TODO: Split populate under replyTo 
                    if (shouldPopulateFrom) { 
                        message
                        .populate({ 
                            path: "replyTo",
                            select: '-isImported -importedOn -summary -replyTo -__v -uniqueId',  
                            populate: {
                                path: "media reactions status from status.user",
                                select: '_id id name email phone imageUrl status kind date from thumbnail url type',
                                populate: {
                                    path: "from",
                                    select: utils.userColumnsToShow() 
                                }
                            }
                        }).populate({
                            path: 'status.user',
                            select: utils.userColumnsToShow() 
                        }).populate({
                            path: 'media',
                            select: utils.mediaColumnsToShow(),
                            populate: {
                                path: "from",
                                select: utils.userColumnsToShow()
                            }
                        }).populate({
                            path: "from",
                            select: utils.userColumnsToShow() 
                        }, (err, msg) => {
                            if (err) return reject(err);
        
                            resolve({
                                title: "Message is saved",
                                message: msg
                            });
                        });
                    } else {
                        resolve({
                            title: "Message is saved",
                            message: message
                        });
                    }
                });
            });
        } catch (ex) {
            console.log(`Error occurred: ${ex.message}`)
            return new Promise((resolve, reject) => {
                reject(ex);
            })
        } 
    }

    /**
     *
     * Set message status for a single user to delivered
     * @param {*} user
     * @param {*} message
     * @returns same Message
     * @memberof MessageServiceDB
     */
    async messageDelivered(users, messageId, date) {
        if (typeof users === 'number') {
            const userService = new UserService(UserModel);
            users = await userService.getUserIds([users]);
        }

        if (typeof users === 'string') {  
            users = [users];
        }

        return new Promise((resolve, reject) => {
            const filter = { _id: messageId, 'status.user': { "$in": users } };
            const update = { $set: { 'status.$.delivered': new Date(date) } };

            this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean().then((editedMessage) => {  
                if (editedMessage) {
                    resolve(editedMessage);
                } else {
                    reject(new Error('User is not part of the chat'));
                }
            }).then((err) => {
                reject(err);
            });
        });
    }

    /**
     *
     * Set message status to sent
     * @param {*} users
     * @param {*} message
     * @memberof MessageServiceDB
     */
    setMessageSentTo(users, message) {
        for (const to of users) {  
            const sent = {
                user: to,
                sent: message.sentOn
            };
    
            message.status.push(sent)
        }

        message.save(err => {
            if (err) {
                console.log('Message is not updated with SentTo: ', err);
            } else {
                console.log('Message is updated with SentTo');
            } 
        });
    }

    /**
     *
     * Mark message as read by user
     * @param {*} user
     * @param {*} message
     * @returns the same Message
     * @memberof MessageServiceDB
     */
    async messageSeen(byUser, messageId, date) {
        return new Promise((resolve, reject) => {
            const filter = { _id: messageId, 'status.user': { $eq: byUser } };
            const update = { $set: { 'status.$.read': new Date(date*1000) } };

            this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean().then((editedMessage) => {  
                if (editedMessage) {
                    resolve(editedMessage);
                } else {
                    reject(new Error('User is not part of the chat'));
                }
            }).then((err) => {
                reject(err);
            });  
        }); 
    }; 

    /**
     *
     * Delete a single message by id. Message can be deleted for myself or for everyone
     * @param {*} options: for Myself or everyone
     * @returns
     * @memberof MessageServiceDB
     */
    async deleteMessage(messageId, from, forEveryone) {
        return new Promise((resolve, reject) => {
            this.model.findById(messageId, (err, message) => {
                if (err) return reject(err);

                if (message) {
                    if (!message.deleted) {
                        message.deleted = {
                            forMyself: null,
                            forEveryone: null,
                            by: null,
                            from: null,
                            date: null
                        }
                    }
                    if (forEveryone) {
                        message.deleted.forEveryone = true;
                        if (message.deleted.forMyself) { 
                            message.deleted.forMyself = false;
                        }
                    } else {
                        //
                        if (message.deleted.forEveryone) { 
                            message.deleted.forEveryone = false;
                        }

                        message.deleted.forMyself = true;
                    }
                    message.deleted.by = from;
                    message.deleted.date = Date.now();
                }

                message.save((err) => {
                    if (err) return reject(err);

                    resolve({title: 'Message marked as deleted', message: message});
                })
            })
        }) 
    }

    /**
     *
     * React on a message
     * @param {*} messageId
     * @param {*} kind
     * @param {*} from
     * @returns
     * @memberof MessageServiceDB
     */
    async reactOnMessage(messageId, kind, from, date) {
        return new Promise((resolve, reject) => {
            this.getById(messageId).then(async (message) => {
                try {
                    let reaction;
                    let rct;
                    
                    const newDate = Date(date * 1000);
                    //TODO: Need to finish the reaction update. if there is one reaction from same user and same message thant it needs to update
                    const reactExists = await Reaction.findOne({from: from, message: messageId}).populate({
                        path: "from",
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status'
                    }) 

                    const userService = new UserService(UserModel);
                    const userFrom = await userService.getUserById(from, true);

                    if (reactExists) {
                        reactExists.kind = kind;
                        reactExists.date = newDate;
                        reactExists.editedOn = newDate;
                        await reactExists.save();
                        const reactionIndex = message.reactions.findIndex(react => react._id.toString() === reactExists._id.toString());
                        message.reactions[reactionIndex] = reactExists;
                        reaction = reactExists._doc;
                    } else {
                        rct = Reaction({
                            from: from,
                            kind: kind,
                            message: messageId,
                            date: newDate,
                            chatId: message.chatId
                        });

                        reaction = rct._doc;

                        const react = await rct.save();

                        message.reactions.push(react);
                    }
                    // MARK: Todo fill out the user from  
                    reaction.from = userFrom;
     
                    // Update the message
                    message.save((err) => {
                        if (err) return reject(err);

                        resolve({
                            reaction: reaction, 
                            message: message._doc,
                            title: 'Reaction saved for message'
                        });
                    });
                } catch (ex) {
                    reject(ex.message);
                }
            }).catch((err) => {
                reject(err);
            })
        });
    }

    /**
     * Get messages by chatId
     * NOT IN USE
     * @param {*} chatId
     * @param {*} userId
     * @returns
     * @memberof MessageServiceDB
     */
    async getMessagesForChat(chatId, userId, skip = -1, callback) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {  
            const cs = new ChatService(ChatModel);
            // First fet the details of the user and check against the join date
            // THen filter the messages greater than their join date

            // console.log(`last message date: ${lastMessageDate}`)
            cs.getChatMember(chatId, userId)
            .then(member => {
                console.log('date joined: ' + member.joinedOn)
                const query = { 
                    'deleted.date': { $eq: null } ,
                    chatId: chatId ,
                    // $and: [{ sentOn: { $lte: lastMessageDate } }],
                    // $and: [{ sentOn: { $gte: member.joinedOn } }]
                        // { $or: [] }
                    sentOn: { $gte: member.joinedOn }
                }

                // console.log(`Getting messages for: ${chatId}`)
                let options = {
                    sort: { sentOn: -1 },
                    select: utils.messageColumnsToShow(),
                    lean: true,
                    offset: skip,
                    limit: 50,
                    populate: {
                        path: "from status.user",
                        select: utils.userColumnsToShow() 
                    },
                    populate: {
                        path: "replyTo media",
                        select: utils.replyMessageColumnsToShow() + utils.mediaColumnsToShow()
                    } 
                }

                if (skip == -1) {
                    options = {
                        sort: { sentOn: -1 },
                        select: utils.messageColumnsToShow(),
                        lean: true,
                        offset: 0,
                        page: 0,
                        // limit: 0,
                        populate: {
                            path: "from status.user",
                            select: utils.userColumnsToShow() 
                        },
                        populate: {
                            path: "replyTo media",
                            select: utils.replyMessageColumnsToShow() + utils.mediaColumnsToShow()
                        } 
                    }
                }
                this.model
                .paginate(query, options)
                 
                .then((messages) => {   
                    console.log(`Total messages: ${messages.length}`)
                    resolve({ messages: messages });

                    if (messages.length) {
                        const messageOwners = messages.map(m => m.from._id.toString()).filter(from => from != userId);

                        const uniqueSenders = messageOwners.filter(function (elem, index, self) {
                            return index === self.indexOf(elem);
                        })

                        const query = {
                            chatId: chatId,
                            from: { $ne: new ObjectId(userId) },
                            status: {
                                $elemMatch: {
                                    user: { $eq: new ObjectId(userId) }
                                }
                            }
                        }
                        const update = { $set: { 'status.$[elem].read': Date.now() } };
                        const filter = { arrayFilters: [{ "elem.read": { $eq: null } }] }
                        this.model.updateMany(query, update, filter, (err, result) => {
                            if (err) {
                                console.error(`Error updating messages to read: ${err.message}`);
                            } else {
                                if (result.nModified > 0) {
                                    console.log(`Messages marked as read, Total: ${result.nModified}`);
                                    // resolve({status: 'unread messages', messages: res.messages});
                                    callback(true, uniqueSenders, chatId, userId);
                                } else {
                                    console.log('Nothing to update for conversation')
                                    // resolve({messages: res.messages});
                                    callback(false, uniqueSenders, chatId, userId);
                                }
                            }
                        });
                    }
                }).catch((err) => {
                    reject(err);
                }) 
            }).catch(err => reject(err)) 
        });
    }

    /**
     * Get chat messages s
     *
     * @param {*} chatId
     * @param {*} userId
     * @param {*} [toMessageDate=null]
     * @returns
     * @memberof MessageServiceDB
     */
    async getMessages(chatId, userId, toMessageDate = null, howMany = -1, startValue, isInitial, callback) {
        if (typeof userId === 'number') { 
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        const cs = new ChatService(ChatModel);
        const member = await cs.getChatMember(chatId, userId); 
        // console.log(`Member join date: ${JSON.stringify(member, null, 14)}`)
        console.log(`toMessageDate: ${toMessageDate}`)
        return new Promise((resolve, reject) => {  

            let query = {}

            if (startValue) { 
                query = {
                    _id: { $lt: startValue },
                    'deleted.date': { $eq: null },
                    chatId: chatId, 
                    sentOn: { $gte: new Date(member.joinedOn) }
                }
            } else {
                query = { 
                    'deleted.date': { $eq: null },
                    chatId: chatId, 
                    sentOn: { $gte: new Date(member.joinedOn) }
                }
            }

            if (toMessageDate) {
                let $and;
                if (isInitial) {
                    // query.sentOn = { $gt: new Date(toMessageDate) } 
                    $and = [
                        { sentOn: { $gte: new Date(member.joinedOn) } },
                        { sentOn: { $gt: new Date(toMessageDate) } }
                    ]
                } else {
                    $and = [
                        { sentOn: { $gte: new Date(member.joinedOn) } },
                        { sentOn: { $lte: new Date(toMessageDate) } }
                    ]
                }
                
                query["$and"] = $and;
            }

            // const $visibleAnd = [
            //     { $and: [{ visible: { $eq: true } }, { visible: { $exists: true } }] },
            //     // { visible: { $eq: true, $exists: true }  },
            //     { from: { $eq: new ObjectId(userId) } }
            // ]
        
            // query["$or"] = $visibleAnd;

            this.model
                .find(query)
                .select(utils.messageColumnsToShow())
                .populate({
                    path: "from",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status'
                })
                .populate({
                    path: "status.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status'
                })
                .populate({
                    path: "media",
                    select: utils.mediaColumnsToShow()
                })
                .populate({
                    path: "reactions",
                    select: utils.reactionColumnsToShow(),
                    populate: {
                        path: "from",
                        select: utils.userColumnsToShow() 
                    }
                })
                .populate({
                    path: "replyTo",
                    select: utils.replyMessageColumnsToShow(),
                    populate: {
                        path: "media reactions from",
                        select: utils.reactionColumnsToShow() + utils.mediaColumnsToShow() + utils.userColumnsToShow(),
                        populate: {
                            path: "from",
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status'
                        }
                    }
                })
                .sort({ sentOn: -1 })
                // .skip((skip == -1) ? 0 : skip)
                .limit((howMany != -1) ? howMany : 0)
                .lean()
                .then((messages) => {  
                    console.log(`Total messages: ${messages.length}`)
                    resolve({ messages: messages });

                    if (messages.length) {
                         const messageOwners = messages.map(m => m.from._id.toString()).filter(from => from != userId);

                        const uniqueSenders = messageOwners.filter(function (elem, index, self) {
                            return index === self.indexOf(elem);
                        })

                        const query = {
                            chatId: chatId,
                            from: { $ne: new ObjectId(userId) },
                            status: {
                                $elemMatch: {
                                    user: { $eq: new ObjectId(userId) }
                                }
                            }
                        }
                        const update = { $set: { 'status.$[elem].read': Date.now() } };
                        const filter = { arrayFilters: [{ "elem.read": { $eq: null } }] }
                        this.model.updateMany(query, update, filter, (err, result) => {
                            if (err) {
                                console.error(`Error updating messages to read: ${err.message}`);
                            } else {
                                if (result.nModified > 0) {
                                    console.log(`Messages marked as read, Total: ${result.nModified}`);
                                    // resolve({status: 'unread messages', messages: res.messages});
                                    callback(true, uniqueSenders, chatId, userId);
                                } else {
                                    console.log('No messages marked as read for conversation')
                                    // resolve({messages: res.messages});
                                    callback(false, uniqueSenders, chatId, userId);
                                }
                            }
                        });
                    } 
                }) 
                .catch((err) => {
                    console.error(`Error occurred while marking messages read: ` + err.message)
                    reject(err);
                }); 
        });
    }
 
    /**
     *
     * Override
     * @param {*} id
     * @returns
     * @memberof MessageServiceDB
     */
    async getById(id) {
        return new Promise((resolve, reject) => {
            this.model.findById(id)
            .select('-isImported -importedOn -summary -__v -uniqueId')
            .populate({
                path: "from",
                select: utils.userColumnsToShow()
                // select: '_id id name email phone imageUrl status'
            })
            .populate({
                path: "status.user",
                select: utils.userColumnsToShow()
                // select: '_id id name email phone imageUrl status'
            })
            .populate({
                path: "media",
                select: utils.mediaColumnsToShow()
            })
            .populate({
                path: "reactions",
                select: utils.reactionColumnsToShow(),
                populate: {
                    path: "from",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status'
                }
            })
            .populate({
                path: "replyTo",
                select: '-isImported -importedOn -summary -replyTo -__v -uniqueId',
                populate: {
                    path: "media reactions from",
                    select: '_id id name email phone imageUrl status kind date from thumbnail url type',
                    populate: {
                        path: "from",
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status'
                    }
                }
            })
            // .lean()
            .then(message => {
                resolve(message)
            }).catch(err => {
                reject(err);
            })
        });
    }

    async getLastMessageForChat(chatId) { 
        return this.model.find({chatId: chatId}).sort({sentOn: -1}).limit(1).exec() 
    }

    async getFirstMessageForChat(chatId) { 
        return this.model.find({chatId: chatId}).sort({sentOn: 1}).limit(1).exec() 
    }

    async setMessageType(messageId, kind) {
        return new Promise((resolve, reject) => {
            const filter = { uniqueId: messageId }; 
            console.log(`Kind: ${kind}`)
            this.model.findOneAndUpdate(filter, { kind: kind }, { new: true })
            // .lean()
            .then(async (message) => {   
                console.log(`Message type set to d: ${kind} for message: ${message._id}`)
                resolve(true);
            }).catch((err) => { 
                console.log(`Message type NOT set to d: ${kind} for message: ${messageId} Error thrown: ${err}`)
                resolve(false); 
            })
        });
    }; 

    async getMessageWithoutStatus() {
        return new Promise((resolve, reject) => {
            const filter = { status: [] };  
            this.model.find(filter)
            // .lean()
            .then(async (messages) => {    
                resolve(messages);
            }).catch((err) => { 
                console.log(` Error thrown while getting messages without status: ${err}`)
                reject(err); 
            })
        });
    }; 

    /**
     * Mark conversation seen
     *
     * @param {*} userId
     * @param {*} chatId
     * @memberof MessageServiceDB
     */
    async markConversationSeen(userId, chatId, date = null) {
        return new Promise((resolve, reject) => {
            const query = {
                chatId: chatId,
                from: { $ne: new ObjectId(userId) },
                status: {
                    $elemMatch: {
                        user: { $eq: new ObjectId(userId) }
                    }
                }
            }
            const markDate = date || Date.now()
            const update = { $set: { 'status.$[elem].read': markDate } };
            const filter = { arrayFilters: [{ "elem.read": { $eq: null } }] }
            this.model.updateMany(query, update, filter, (err, result) => {
                if (err) {
                    console.log(`Error marking entire conversation seen: ${err.message}`);
                    reject(err);
                } else {
                    // if (result.nModified > 0) {
                    console.log(`Conversation marked as seen, Total: ${result.nModified}`);
                    // }

                    resolve({status: 'unread messages', total: result.nModified});
                }
            });
        }); 
    }

    /**
     * Mark message not visible
     *
     * @param {*} userId
     * @param {*} chatId
     * @memberof MessageServiceDB
     */
    async setMessageNotVisible(messageId) {  
        return new Promise((resolve, reject) => {
            const filter = { _id: messageId };
            const update = { $set: { 'visible': false } };

            this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean().then((editedMessage) => {  
                if (editedMessage) {
                    resolve(editedMessage);
                } else {
                    reject(new Error('No message found'));
                }
            }).then((err) => {
                reject(err);
            });
        });
    }
}

module.exports = MessageServiceDB;