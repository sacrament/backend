const ChatService = require('./chat.service');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const UserService = require('../user/user.service');
const UserModel = mongoose.model('User'); 
const BlockUserModel = mongoose.model('BlockUser'); 
const MessageModel = mongoose.model('Message');

const APIGateway = require('../../external/aws/api.gateway');

const utils = require('../../../utils/index');
/**
 *
 *
 * @class ChatServiceDB
 * @extends {ChatService}   
 */
class ChatServiceDB extends ChatService { 
    /**
     *
     *
     * @param {*} data
     * @returns async Promise()
     * @memberof ChatServiceDB
     */
    async create(data) { 
        var userId = data.userId;

        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }
        // MARK: Check the try catch block against the Promise
        return new Promise( async resolve => {
            try {  
                const userService = new UserService(UserModel);
                const userIds = await userService.getUserIds(data.chat.users);

                const type = data.chat.type;
                if (type == 'private') {
                    const mms = [userId, userIds];
                    // Check if there's already chat
                    const query = { 
                        type: 'private',
                        'members.user': { $all : mms } 
                        // members: {
                        //     $elemMatch: {
                        //         user: {$in: mms}
                        //     }
                        // }
                    };
        
                    const chat = await this.model
                    .findOne(query)
                    .populate({
                        path: 'lastMessage',
                        select: utils.messageColumnsToShow(),
                        // select: '_id id content kind sentOn from',
                        populate: { 
                            path: 'from', 
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status' 
                        }
                    })
                    .populate(
                        { 
                            path: 'members.user', 
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status' 
                        }
                    ).exec();

                    if (chat) {
                        chat.active = true;
                        chat.deleted = false;
                        chat.deletedOn = null;
                        chat.deletedBy = null;

                        if (chat.type == 'private') {
                            const noMembers = chat.members.filter(member => member.canChat == true);
                            if (noMembers.length == 0) {
                                const date = Date.now();
                                chat.updatedOn = date;
                                chat.createdOn = date
                            }
                        }

                        // chat.createdOn = Date.now()

                        // set members to active 
                        for (const member of chat.members) {
                            // if (!member.canChat) {
                            if (member.user._id.toString() == userId) {
                                member.canChat = true;
                                member.options.blocked = false;
                                member.updatedOn = Date.now();
                                member.joinedOn = Date.now();
                                member.leftOn = null;
                            } 
                        }

                        await chat.save();

                        return resolve(
                            {
                                message: "There is an existing Chat already",
                                chat: chat
                            }
                        );
                    }
                }

                const chat = new this.model; 
                chat.type = data.chat.type;
                chat.name = data.chat.name;
                chat.uniqueId = chat._id;
                
                if (chat.type == 'group') { 
                    chat.imageUrl = data.chat.imageUrl || null;
                }

                chat.members.push({ user: userId, creator: true }); 

                if ( typeof userIds === 'string') {
                    const uo = { user: userIds };

                    chat.members.push(uo);
                } else {
                    for (const u of userIds) {
                        const uo = { user: u };
    
                        chat.members.push(uo);
                    }
                }
                
                try {
                    await chat.save();

                    const newlyCreatedChat = await this.getOnlyChat(chat._id);
                    resolve({
                        message: "New chat saved",
                        chat: newlyCreatedChat
                    });
                } catch (ex) {
                    reject(ex.message)
                }
            } catch (ex) {
                throw ex;
            } 
        }, reject => {
            reject(ex.message)
        });
    }
 
    /**
     * NOT IS USE
     *
     * @param {*} chat
     * @returns Promise()
     * @memberof ChatServiceDB
     */
    async save(chat) { 
        return new Promise((resolve, reject) => {
            if (!chat) return reject(new Error('No chat found'));

            chat.save(err => {
                if (err) return reject(err);

                chat.populate( 
                    { 
                        path: 'members.user', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }, (err, msg) => {
                    if (err) return reject(err);

                    resolve({
                        message: "Chat is saved",
                        chat: chat
                    });
                });  
            });
        });
    }

    /**
     *
     * Edit chat
     * @param {*} chatId
     * @param {*} name
     * @param {*} imageUrl
     * @returns
     * @memberof ChatServiceDB
     */
    async edit(data) { 
        return new Promise((resolve, reject) => {
            const query = {
                _id: data.id
                // active: true
            };

            var update = {};

            if (data.name) {
                update.name = data.name;
            }

            if (data.imageUrl) {
                update.imageUrl = data.imageUrl;
            }

            if (Object.keys(update).length === 0) {
                return reject(new Error('Nothing to update'));
            }

            this.model.findOneAndUpdate(query, update, { new: true, runValidators: true })
            .populate(
                {
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status device'
                }
            )
            .populate( 
                {
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            )
            .lean()
            .then((chat) => { 
                if (!chat) return reject(new Error('No chat found for given id'));
                
                resolve({
                    message: "Chat is edited and saved",
                    chat: chat
                });
            }).then((err) => {
                reject(err);
            })
        });
    } 

    /**
     *
     * Add new members to the chat
     * @param {*} chatId
     * @param {*} users
     * @returns
     * @memberof ChatServiceDB
     */
    async newMembers(chatId, users, fromUser) {
        // Lookup current members with id's 
        const q = {
            _id: chatId,
            'members.user': {$in: users.map(user => new ObjectId(user))}
        }
        const foundChat = await this.model.findOne(q)
        .populate(
            {
                path: "members.user",
                select: utils.userColumnsToShow()
                // select: '_id id name email phone imageUrl status device'
            }
        ).populate( 
            {
                path: 'lastMessage',
                select: utils.messageColumnsToShow(),
                // select: '_id id content kind sentOn from',
                populate: { 
                    path: 'from', 
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status' 
                }
            }
        ).exec()

        if (foundChat) {
            console.log(`These users are already members the chat`);
            return new Promise((resolve) => {
                resolve({ chat: foundChat, exists: true })
            });
        }

        //TODO: Finish adding ne members to chat
        const mapUsers = await users.map( (member) => { 
            return { user: member }
        });

        return new Promise((resolve, reject) => {
            const query = { _id: chatId };
            const update = { $addToSet: { members: { $each: mapUsers } } };
            this.model.findOneAndUpdate(query, update, { new: true })
            .populate(
                {
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status device'
                }
            ).populate( 
                {
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            ).lean()
            .then( (chat) => {
                if (chat) {
                    // const totalUnread = await this.countUnreadMessagesForChat(chatId, fromUser);
                    // chat.unreadMessages = totalUnread
                    resolve({ chat: chat, exists: false })
                } else {
                    reject(new Error('No chat found'))
                }
            }).catch(err => reject(err)); 
        }) 
    }

    /**
     *
     *
     * @param {*} chatId
     * @param {*} users
     * @returns
     * @memberof ChatServiceDB
     */
    async removeMembers(chatId, users) { 
        // return 
        return new Promise((resolve, reject) => {
            const query = { _id: chatId };
            const update = { $pull: { members: { user: { $in: users.map(user => new ObjectId(user)) } } } };
            this.model.findOneAndUpdate(query, update, { new: true })
                .populate(
                    {
                        path: "members.user",
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status device'
                    }
                )
                .populate(
                    {
                        path: 'lastMessage',
                        select: utils.messageColumnsToShow(),
                        // select: '_id id content kind sentOn from',
                        populate: { 
                            path: 'from', 
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status' 
                        }
                    }
                )
                .lean()
                .then((chat) => {
                    if (chat) {
                        resolve(chat)
                    } else {
                        reject(new Error('No chat found'))
                    }
                }).catch(err => reject(err));
        });
    }

    /**
     *
     * Leave chat from a member 
     * @param {*} userId
     * @param {*} chatId
     * @memberof ChatServiceDB
     */
    async leaveChat(userId, chatId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const date = Date.now();
            const filter = { 'members.user': userId, _id: chatId };
            // const update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date } };
            const update = { $pull: { members: { user: { $eq: new ObjectId(userId) } } } };
            this.model.findOneAndUpdate(filter, update, { new: true })
            .populate(
                {
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status device'
                }
            ).populate( 
                {
                    path: 'lastMessage', 
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            ).lean().then((chat) => {  
                if (chat) {
                    resolve({
                        title: "User is not part of the chat anymore",
                        chat: chat
                    });
                } else {
                    reject(new Error('User is not member of the chat'));
                } 
            }).then((err) => {
                reject(err); 
            })
        });
    } 

    /**
     *
     * Delete chat only by creator/admin
     * @param {*} userId
     * @param {*} chatId
     * @memberof ChatServiceDB
     */
    async deleteChat(chatId, forUser) {
        return new Promise( async (resolve, reject) => {
            try { 
                const chat = await this.getOnlyChat(chatId);
                const date = Date.now();


            //MARK: Check the chat's type and then update accordingly; e.g chat group admin should delete the group. private chat just set the action taker to false 
                let filter = { 'members.user': forUser, _id: chatId };
                let update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date } };

                if (chat.type == 'group') {
                    filter = { _id: chatId };
                    update = { $set: { active: false, deleted: true, deletedOn: Date.now(), deletedBy: forUser } };
                } else {
                    const noMembers = chat.members.filter(member => member.canChat == true);
                    if (noMembers.length == 1) {
                        update = { $set: { 'members.$.canChat': false, 'members.$.leftOn': date, 'members.$.updatedOn': date, 'lastMessage': null } };
                    }
                }

                this.model.findOneAndUpdate(filter, update, { new: true })
                    .populate(
                        {
                            path: "members.user",
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status device'
                        }
                    ).populate(
                        {
                            path: 'lastMessage', 
                            select: utils.messageColumnsToShow(),
                            // select: '_id id content kind sentOn from',
                            populate: { 
                                path: 'from', 
                                select: utils.userColumnsToShow()
                                // select: '_id id name email phone imageUrl status' 
                            }
                        }
                    )
                    .lean()
                    .then((chat) => {
                        if (chat) {
                            resolve({
                                message: "Chat group is marked deleted",
                                chat: chat
                            });
                        } else {
                            reject(new Error('No chat group found to be deleted'));
                        }
                    }).catch((err) => {
                        reject(err);
                    });
            } catch (ex) {
                reject(ex.message)
            }  
        });
    };

    /**
     *
     * Favorite a chat
     * @param {*} userId
     * @param {*} chatId
     * @memberof ChatServiceDB
     */
    async favoriteChat(userId, chatId, status) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const filter = { 'members.user': userId, _id: chatId };
            const update = { $set: { 'members.$.options.favorite': status, 'members.$.updatedOn': Date.now() } };

            this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .populate(
                {
                    path: "members.user",
                    // select: '_id id name email phone imageUrl status'
                    select: utils.userColumnsToShow()
                }
            ).populate( 
                {
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            ).lean().then((chat) => {  
                if (chat) {
                    resolve({
                        text: status ? "Added to favourites" : "Removed from favourites",
                        favoriteStatus: status,
                        chat: chat
                    });
                } else {
                    reject(new Error('Not chat found'));
                } 
            }).then((err) => {
                reject(err); 
            })
        });
    };

    /**
     *
     * Mute a chat
     * @param {*} userId
     * @param {*} chatId
     * @memberof ChatServiceDB
     */
    async muteChat(userId, chatId, status) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const filter = { 'members.user': userId, _id: chatId };
            const update = { $set: { 'members.$.options.muted': status, 'members.$.updatedOn': Date.now() } };

            this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true })
            .populate(
                {
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status'
                }
            )
            .populate( 
                {
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            ).lean().then((chat) => {  
                if (chat) {
                    resolve({
                        // message: "This chat is muted for push notifications",
                        text: status ? "Chat is muted" : "Chat is unmuted",
                        muteStatus: status,
                        chat: chat
                    });
                } else {
                    reject(new Error('No chat found'));
                } 
            }).then((err) => {
                reject(err); 
            })
        });
    };

    /**
     *
     * Block chat conversation
     * @param {*} userId
     * @param {*} chatId
     * @memberof ChatServiceDB
     */
    async blockChat(me, chatId, status, reason = "", description = "") {
        let userId = me.user || me;
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const filter = { 'members.user': userId, _id: chatId };
            const update = { $set: { 'members.$.options.blocked': status, 'members.$.updatedOn': Date.now() } };

            this.model.findOneAndUpdate(filter, update)
            .populate(
                {
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status'
                }
            )
            .populate( 
                {
                    path: 'lastMessage', 
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: { 
                        path: 'from', 
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            )
            .lean()
            .then(async (chat) => {  
                if (chat) {
                    resolve({
                        text: status ? "Chat is blocked" : "Chat is unblocked",
                        blockStatus: status,
                        chat: chat
                    });

                    //find the creator
                    // set the chat to not active if the creator is blocking the chat

                    // const creator = chat.members.filter(m => m.user._id == userId)[0];
                    // if (creator) {
                    //     chat.active = false;
                    // }
                    // get chat members;
                    // API Call 
                    const chatMembers = chat.members.filter(m => m.user._id != userId);
 
                    // add blocked users to the table
                    const userService = new UserService(BlockUserModel);
                    await (status ? userService.blockUsers(chatMembers, userId, reason, description) : userService.unblockUsers(chatMembers, userId));

                    const apiGateway = new APIGateway();
                    const promises = chatMembers.map(async m => {
                        //Wait for the response
                        const member = m.user;
                        const res = status ? await apiGateway.blockUser(member.id, me.token) : await apiGateway.unblockUser(member.id, me.token);

                        return res;
                    });

                    const result = await Promise.all(promises);
                    console.log(`Result from API [${status ? 'BLOCK' : 'UNBLOCK'} user]: ${result}`);
                } else {
                    reject(new Error('No chat found'));
                } 
            }).catch((err) => {
                console.error(`Error blocking/unblcoking: ${err}`)
                reject(err); 
            })
        });
    };

    /**
     * Set last message to a chat
     *
     * @param {*} chatId
     * @param {*} messageId
     * @returns
     * @memberof ChatServiceDB
     */
    async setLatestMessage(chatId, messageId, userId = null) {
        return new Promise((resolve, reject) => {
            const filter = { _id: chatId }; 

            this.model.findOneAndUpdate(filter, { lastMessage: messageId }, { new: true, runValidators: true }).
            populate(
                {
                    path: "members.user", 
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl status device'
                }
            )
            .populate( 
                {
                    path: 'lastMessage',
                    // select: '_id id content kind sentOn from',
                    select: utils.lastMessageColumnsToShow(),
                    populate: { 
                        path: 'from media', 
                        select: utils.userColumnsToShow() + utils.mediaColumnsToShow()
                        // select: '_id id name email phone imageUrl status' 
                    }
                }
            )
            .lean()
            .then(async (chat) => {  
                if (chat) {
                    if (userId) {
                        console.log(`Last message with id: ${messageId} is set for chat: ${chatId}`)
                        const totalUnread = await this.countUnreadMessagesForChat(chatId, userId);
                        chat.unreadMessages = totalUnread
                    }
                
                    resolve({
                        message: "This chat is been set a last message",
                        chat: chat
                    });
                } else {
                    console.log(`Last message with id: ${messageId} is NOT set for chat: ${chatId}. Error thrown`)
                    reject(new Error('No chat found'));
                } 
            }).catch((err) => { 
                console.log(`Last message with id: ${messageId} is NOT set for chat: ${chatId}. Error thrown: ${err}`)
                reject(err); 
            })
        });
    }; 

    /**
     * Get all imported chats
     *
     * @returns
     * @memberof ChatServiceDB
     */
    async getAllImportedChats() {
        return new Promise((resolve, reject) => {
             resolve(this.model.find({isImported: true}).exec());
        });
    }

    /**
     *
     *
     * @param {*} chatId
     * @param {*} date
     * @returns
     * @memberof ChatServiceDB
     */
    async setCreatedDate(chatId, date) {
        return new Promise((resolve, reject) => {
            const filter = { _id: chatId }; 

            this.model.findOneAndUpdate(filter, { createdOn: date }, { new: true, runValidators: true })
            // .lean()
            .then(async (chat) => {  
                if (chat) {
                    const update = { $set: { 'members.$[elem].joinedOn': date } };
                    const filter1 = { arrayFilters: [ { "elem.joinedOn": { $gt: date } } ] }
                    this.model.updateMany(filter, update, filter1, (err, result) => {
                        if (err) {
                            console.log(`Error updating messages to read: ${err.message}`)
                        } else {
                            resolve({
                                message: "This chat is been set a last message",
                                chat: chat
                            });
                        }
                    });
                    
                } else {
                    console.log(`Last message with id: ${messageId} is NOT set for chat: ${chatId}. Error thrown`)
                    reject(new Error('No chat found'));
                } 
            }).catch((err) => { 
                console.log(`Last message with id: ${messageId} is NOT set for chat: ${chatId}. Error thrown: ${err}`)
                reject(err); 
            })
        });
    };  


    /**
     * Update chat with last message. This action could be triggered when a chat message is deleted
     *
     * @param {*} chatId
     * @memberof ChatService
     */
    async updateChatWithLastMessage(chatId) {
        // get the last message in the chat
        try { 
            const lm = await MessageModel.find({ chatId: new ObjectId(chatId), 'deleted.date': null }).sort({ sentOn: -1 }).limit(1)

            if (lm.length) {
                const last = lm[0]; 
                const result = await this.setLatestMessage(chatId, last._id);
                return result;
            } else {
                return await this.setLatestMessage(chatId, null); 
            }

            // return await this.getChatById(chatId); 
        } catch (ex) {
            return ex;
        }
    }
/**
 *Clear a specific chat for user
 *
 * @param {*} chatId
 * @param {*} forUser
 * @return {*} 
 * @memberof ChatServiceDB
 */
async clearChat(chatId, forUser) {
        return new Promise( async (resolve, reject) => {
            try {  
                const date = Date.now(); 

            //MARK: Check the chat's type and then update accordingly; e.g chat group admin should delete the group. private chat just set the action taker to false 
                const filter = { 'members.user': forUser, _id: chatId };
                const update = { $set: { 'members.$.canChat': true, 'members.$.joinedOn': date, 'members.$.updatedOn': date } };

                this.model.findOneAndUpdate(filter, update, { new: true })
                    .populate(
                        {
                            path: "members.user",
                            select: utils.userColumnsToShow()
                            // select: '_id id name email phone imageUrl status device'
                        }
                    ).populate(
                        {
                            path: 'lastMessage', 
                            select: utils.messageColumnsToShow(),
                            // select: '_id id content kind sentOn from',
                            populate: { 
                                path: 'from', 
                                select: utils.userColumnsToShow()
                                // select: '_id id name email phone imageUrl status' 
                            }
                        }
                    )
                    .lean()
                    .then((chat) => {
                        if (chat) {
                            resolve({
                                message: "Chat is marked cleared",
                                chat: chat
                            });
                        } else {
                            reject(new Error('No chat found to be cleared'));
                        }
                    }).catch((err) => {
                        reject(err);
                    });
            } catch (ex) {
                reject(ex.message)
            }  
        });
    };

    /**
     * Delete all chats for uer
     * 
     *
     * @param {*} userId
     * @return {*} 
     * @memberof ChatService
     */
    async deleteAllChatsForUser(userId) {
        const aggregate = this.model.aggregate([
            // unwind the history array 
            {
                $match: {  
                    members: {
                        $elemMatch: {
                            $and: [ { user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } } ]
                        }
                    }
                }
            }
        ]);

        try { 
            const chats = await aggregate.exec()
            console.log(`TOtal chats fetched: ${chats.length}`);
            const promises = chats.map(async chat => {   
                // Delete messages for chat
                const query = { chatId: chat._id, from: new ObjectId(userId) };

                const update = { 
                    "deleted.forMyself": true,
                    "deleted.by": userId,
                    "deleted.date": Date.now()
                }

                const messages = await MessageModel.updateMany(query, update, { new: true });
                console.log('total messages deleted: ' + messages.nModified);

                const deleteChat = await this.deleteChat(chat._id, userId);
                console.log('Chat deleted: ' + deleteChat);

                return chat;
            });
        
            // Wait for all to finish 
            const result = await Promise.all(promises);
            console.log('result: ' + result);
            return result;
        } catch (ex) {
            console.error('Error: ' + ex.message)
            return ex;
        }
    }
}

module.exports = ChatServiceDB;