const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const UserService = require('../user/user.service');
const UserModel = mongoose.model('User');

const MessageModel = mongoose.model('Message');
const MessageMediaModel = mongoose.model('Media');
const MessageReactionModel = mongoose.model('Reaction');

const utils = require('../../../utils/index');

class ChatService {
    /**
     *Creates an instance of ChatService.
     * @param {*} chatModel
     * @memberof ChatService
     */
    constructor(chatModel) {
        this.model = chatModel;
    }
    /**
     *
     *
     * @param {*} chatId
     * @returns Promise()
     * @memberof ChatService
     */
    async getById(chatId, userId, populate = true) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const query = {
                _id: chatId,
                // active: true,
                // members: {
                //     $elemMatch: {
                //         user: { '_id': new ObjectId(userId) },
                //         canChat: true
                //     }
                // }

                // active: true,
                // deleted: false,
                members: {
                    $elemMatch: {
                        $and: [{ user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } }],
                        // user: new ObjectId(userId),
                        canChat: true,
                        // 'options.blocked': false,
                    }
                }
            };

            if (populate) {
                this.model
                    .findOne(query)
                    // .select('_id id name members lastMessage type imageUrl createdOn deleted deletedOn')
                    .select(utils.chatColumnsToShow())
                    .populate({
                        path: "members.user",
                        select: utils.userColumnsToShow()
                        // select: '_id id name email phone imageUrl device'
                    })
                    .populate({
                        path: 'lastMessage',
                        select: utils.lastMessageColumnsToShow(),
                        populate: {
                            path: 'from reactions media',
                            select: utils.userColumnsToShow() + utils.reactionColumnsToShow() + utils.mediaColumnsToShow(),
                            populate: {
                                path: 'from',
                                select: utils.userColumnsToShow()
                            }
                        }
                    }) 
                    .lean()
                    .exec(async (err, chat) => {
                        if (err) return reject(err);

                        if (!chat) return reject(new Error('No chat found for given id'));

                        // if (!chat.active && chat.deleted) {
                        //     return reject(new Error('Chat is not active, because it is deleted'));
                        // } 

                        if (chat.type == 'private') {
                            // update chat members to canChat = true
                            try {
                                chat = await this.updatePrivateChatMembersToActive(chatId);
                            } catch (ex) {
                                console.error(ex.message);
                            }
                        }

                        this.countUnreadMessagesForChat(chatId, userId).then(total => {
                            chat.unreadMessages = total == 0 ? 1 : total;
                            // console.info(`Total unread: ${total} for chat: ${chatId} for user: ${userId}`);
                            resolve(chat);
                        }).catch(err => {
                            chat.unreadMessages = 1;
                            console.error(`Error while getting total unread messages for chat: ${chatId} for user: ${userId}. Error: ${err.message}`);
                            resolve(chat);
                        })
                    });
            } else {
                this.model
                    .findOne(query, (err, chat) => {
                        if (err) return reject(err);

                        if (!chat) return reject(new Error('No chat found for given id'));

                        resolve(chat);
                    });
            }
        });
    }

    /**
     *Get all chats
     *
     * @param {*} userId
     * @returns
     * @memberof ChatService
     */
    async getAll(userId, skip = -1) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        console.log(`Get All chats for: ${userId} at ${Date()}`);

        //MARK: Need to populate users insiede the members array
        // MARK: Get the user and check the join date for last message
        // return new Promise((resolve, reject) => {
        const aggregate = this.model.aggregate([
            // unwind the history array 
            {
                $match: {
                    // active: true,
                    // deleted: false,
                    members: {
                        $elemMatch: {
                            $and: [{ user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } }],
                            // user: new ObjectId(userId),5df38dcb4b2986dc45effcbc
                            canChat: true,
                            // 'options.blocked': false,
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'messages',
                    let: {
                        lm: '$lastMessage'
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ['$_id', '$$lm']
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'from',
                                foreignField: '_id',
                                as: 'from'
                            }
                        },
                        {
                            $unwind: {
                                path: '$from',
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: 'messages',
                                localField: 'replyTo',
                                foreignField: '_id',
                                as: 'replyTo'
                            }
                        },
                        {
                            $unwind: {
                                path: '$replyTo',
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'replyTo.from',
                                foreignField: '_id',
                                as: 'replyTo.from'
                            }
                        },
                        {
                            $unwind: {
                                path: '$replyTo.from',
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $project: { //TODO: MARK: Finish it up with reply
                                _id: 1, content: 1, kind: 1, from: 1, sentOn: 1, reactions: 1, status: 1, sharedContact: 1, media: 1, deleted: 1, chatId: 1,
                                replyTo: {
                                    _id: 1, kind: 1, sentOn: 1, reactions: 1, content: 1, media: 1, deleted: 1, chatId: 1,
                                    from: { _id: 1, id: 1, name: 1, email: 1, phone: 1, imageUrl: 1 },
                                    status: {
                                        user: { _id: 1, id: 1, name: 1, email: 1, phone: 1, imageUrl: 1 }
                                    },
                                    reactions: {
                                        from: { _id: 1, id: 1, name: 1, email: 1, phone: 1, imageUrl: 1 }
                                    }
                                }
                            }
                        }
                    ],
                    as: 'lastMessage'
                }
            },
            {
                $unwind: {
                    path: '$lastMessage',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'media',
                    localField: 'lastMessage.media',
                    foreignField: '_id',
                    as: 'media'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'media.from',
                    foreignField: '_id',
                    as: 'fromMediaUsers'
                }
            },
            {
                $addFields: {
                    'media.from': {
                        $arrayElemAt: ['$fromMediaUsers', 0]
                    }
                }
            },
            {
                $lookup: {
                    from: 'reactions',
                    localField: 'lastMessage.reactions',
                    foreignField: '_id',
                    as: 'reactions'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'reactions.from',
                    foreignField: '_id',
                    as: 'fromUsers'
                }
            },
            {
                $addFields: {
                    'reactions.from': {
                        $arrayElemAt: ['$fromUsers', 0]
                    },
                    // 'me': { $arrayElemAt: ['$members.joinedOn', { "$indexOfArray": ["$members.user", new ObjectId(userId)] }] }
                }
            },
            // status of message 
            {
                $lookup: {
                    from: 'users',
                    localField: 'lastMessage.status.user',
                    foreignField: '_id',
                    as: 'fromUsers'
                }
            },
            {
                $addFields: {
                    'lastMessage.status.user': {
                        $arrayElemAt: ['$fromUsers', 0]
                    }
                }
            },
            //members
            {
                $unwind: '$members'
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.user',
                    foreignField: '_id',
                    as: 'users'
                }
            },
            {
                $addFields: {
                    'lastMessage.reactions': '$reactions',
                    'lastMessage.media': '$media',
                    // 'me': { $arrayElemAt: ['$members.joinedOn', { "$indexOfArray": ["$users.user", new ObjectId(userId)] }] },
                    'members.user': {
                        $arrayElemAt: ['$users', 0]
                    }
                }
            },
            {
                $group: {
                    "_id": "$_id",
                    id: { $first: "$id" },
                    name: { $first: "$name" },
                    // publicKey: { $first: "$publicKey" },
                    members: { "$push": "$members" },
                    lastMessage: {
                        $first: {
                            $cond: [
                                { $gte: ['$lastMessage.sentOn', '$me'] }, '$lastMessage', null
                            ]
                        }
                    }, 
                    type: { $first: "$type" },
                    imageUrl: { $first: "$imageUrl" },
                    createdOn: { $first: "$createdOn" },
                    deleted: { $first: "$deleted" },
                    deletedOn: { $first: "$deletedOn" }
                    // me: { $first: '$me' }
                }
            },
            {
                $addFields: {
                    'me': { $arrayElemAt: ['$members.joinedOn', { "$indexOfArray": ["$members.user", new ObjectId(userId)] }] },
                    // lastMessage: '$lastMessage'
                }
            },
            {
                $sort: { "lastMessage.sentOn": -1 }
            },
            {
                $addFields: {
                    lastMessage: {
                        $cond: [
                            { $gte: ['$lastMessage.sentOn', '$me'] },
                            '$lastMessage',
                            null
                        ]
                    }
                }
            }, 
            {

                $replaceRoot: { newRoot: { $mergeObjects: [{ lastMessage: null }, "$$ROOT"] } }

            },
            {
                $project: {
                    members: {
                        user: { requests: 0, device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, __v: 0, contacts: 0, lastLogin: 0, isPublic: 0, chatToken: 0 }
                    },
                    lastMessage: {
                        // $cond: [
                        //     { $gte: ['$lastMessage.sentOn', '$me'] }, '$lastMessage', null
                        // ]
                        from: { requests: 0, device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, lastLogin: 0, __v: 0, contacts: 0, isPublic: 0 },
                        status: {
                            user: { requests: 0, device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, lastLogin: 0, __v: 0, chatToken: 0, contacts: 0, isPublic: 0 }
                        },
                        reactions: {
                            from: { requests: 0, device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, lastLogin: 0, __v: 0, contacts: 0, isPublic: 0 }
                        },
                        media: {
                            from: { requests: 0, device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, lastLogin: 0, __v: 0, contacts: 0, isPublic: 0 }
                        }
                    },
                }
            },
            // { $skip: skip },
            // { $limit: 20 }
        ])
        try {
            let chats;

            if (skip != -1) {
                chats = await aggregate.skip(skip).limit(20).exec();
            } else {
                chats = await aggregate.exec();
            }

            await Promise.all(chats.map(async (chat) => {
                const unread = await this.countUnreadMessagesForChat(chat._id, userId);
                // console.warn(`[WARN]: Chat ${chat.name} Unread messages: ${unread}. Last message: ${chat.lastMessage.content || chat.lastMessage.kind} is DELETED: ${chat.deleted}`)
                chat.unreadMessages = unread;
            }));

            // const res = await Promise.all(promises);

            console.log(`TOtal chats fetched: ${chats.length} at ${Date()}`)
            // console.log(`Result: ${JSON.stringify(result, null, 14)}`);
            return chats;
        } catch (ex) {
            console.error('Error: ' + ex.message)
            return ex;
        }
    }

    /**
     *Get all chats
     *
     * @param {*} userId
     * @returns
     * @memberof ChatService
     */
    async getAllFavoriteChats(userId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        // console.log(`Messages from: ${userId}`);

        //MARK: Need to populate users insiede the members array

        return new Promise((resolve, reject) => {
            this.model.aggregate([
                // unwind the history array 
                {
                    $match: {
                        active: true,
                        members: {
                            $elemMatch: {
                                user: new ObjectId(userId),
                                canChat: true,
                                // 'options.blocked': false,
                                'options.favorite': true
                            }
                        }
                    }
                },

                {
                    $lookup: {
                        from: 'messages',
                        let: {
                            chatId: '$_id'
                        },
                        pipeline: [{
                            $match: {
                                $expr: {
                                    $and: [{
                                        $ne: [
                                            '$from', new ObjectId(userId)
                                        ]
                                    }, {
                                        $eq: [
                                            '$chatId', '$$chatId'
                                        ]
                                    }, {
                                        $eq: [
                                            '$deleted.date', null
                                        ]
                                    }]
                                }
                            }
                        }, {
                            $unwind: {
                                path: '$status',
                                preserveNullAndEmptyArrays: true
                            }
                        }, {
                            $match: {
                                'status.read': {
                                    $eq: null
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$_id"
                            }
                        }
                        ],
                        as: 'unreadMessages'
                    }
                },
                {
                    $project: {
                        chat: '$$ROOT'
                    }
                },
                {
                    $replaceRoot: {
                        newRoot: '$chat'
                    }
                },
                {
                    $addFields: {
                        unreadMessages: {
                            $size: '$unreadMessages'
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'messages',
                        let: {
                            lm: '$lastMessage'
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ['$_id', '$$lm'] }
                                }
                            },
                            {
                                $lookup: {
                                    from: 'users',
                                    localField: 'from',
                                    foreignField: '_id',
                                    as: 'from'
                                }
                            },
                            {
                                $unwind: {
                                    path: '$from',
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            {
                                $project: { _id: 1, content: 1, kind: 1, from: 1, sentOn: 1, reactions: 1 }
                            }
                        ],
                        as: 'lastMessage'
                    }
                },
                {
                    $unwind: '$lastMessage'
                },
                {
                    $unwind: '$members'
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'members.user',
                        foreignField: '_id',
                        as: 'users'
                    }
                },

                {
                    $addFields: {
                        'members.user': {
                            $arrayElemAt: ['$users', 0]
                        }
                    }
                },
                {
                    $group: {
                        "_id": "$_id",
                        id: { $first: "$id" },
                        name: { $first: "$name" },
                        members: { "$push": "$members" },
                        lastMessage: { $first: "$lastMessage" },
                        unreadMessages: { $first: "$unreadMessages" },
                        type: { $first: "$type" },
                        imageUrl: { $first: "$imageUrl" },
                        createdOn: { $first: "$createdOn" }
                    }
                },
                {
                    $project: {
                        members: {
                            user: { device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, __v: 0 }
                        },
                        lastMessage: {
                            from: { device: 0, updatedOn: 0, registeredOn: 0, facebookId: 0, lastLogin: 0, __v: 0 }
                        }
                    }
                }
            ]).then((chats) => {
                resolve(chats);
            }).catch((err) => {
                reject(err);
            });
        });
    }

    /**
     *
     *
     * @param {*} user
     * @param {boolean} [showOnlyFavorites=false]
     * @returns
     * @memberof ChatService
     */
    async getChatsForUser(user, showOnlyFavorites = false, skip = 0) {
        if (showOnlyFavorites) {
            return this.getAllFavoriteChats(user);
        } else {
            return this.getAll(user, skip)
        }
    }

    /**
     *
     *
     * @param {*} chatId
     * @returns
     * @memberof ChatService
     */
    async getChatMembers(chatId, onlyUser = true) {
        return new Promise((resolve, reject) => {
            const query = {
                active: true,
                _id: chatId
            };
            this.model.findOne(query).lean().then((chat) => {
                if (chat) {
                    if (onlyUser) {
                        resolve(chat.members.map(member => member.user));
                    } else {
                        resolve(chat.members.map(member => member));
                    }
                } else {
                    reject(new Error('Chat not found'))
                }
            }).catch(err => reject(err));
        })
    }

    /**
     *
     *
     * @param {*} chatId
     * @param {*} userId
     * @return {*} 
     * @memberof ChatService
     */
    async getChatMember(chatId, userId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve, reject) => {
            const query = {
                active: true,
                _id: chatId,
                members: {
                    $elemMatch: {
                        user: new ObjectId(userId),
                        canChat: true,
                        // 'options.blocked': false,
                    }
                }
            };

            this.model.findOne(query).lean()
                .then((chat) => {
                    if (chat) {
                        resolve(chat.members.filter(member => member.user.toString() == userId)[0]);
                    } else {
                        reject(new Error('User not found in this chat'))
                    }
                }).catch(err => reject(err));
        })
    }

    /**
     * Get total unread messages for a chat and specific user
     *
     * @param {*} chatId
     * @param {*} userId
     * @returns
     * @memberof ChatService
     */
    async countUnreadMessagesForChat(chatId, userId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }
        // console.info(`[INFO]: Total Unread for chat ${chatId} for user: ${userId}`)
        return new Promise((resolve, reject) => {
            MessageModel.countDocuments({
                chatId: { $eq: new ObjectId(chatId) },
                from: { $ne: new ObjectId(userId) },
                kind: { $ne: 'generic' },
                // deleted: { $eq: false },
                'deleted.date': { $eq: null },
                'status.user': { $eq: new ObjectId(userId) },
                // 'status.read': { $eq: null }
                $and: [{ 'status.read': { $eq: null } }, { 'status.read': { $exists: true } }],
            }).exec((err, count) => {
                if (err) return resolve(0);

                // console.log(`[LOG]: Total ${count} for chat ${chatId}`)

                resolve(count);
            });
        })

    }

    /**
     * Get total unread messages for a single user
     *
     * @param {*} userId
     * @returns
     * @memberof ChatService
     */
    async countUnreadMessagesForUser(userId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }
        // console.log(`User: ${userId}`)
        // return MessageModel.countDocuments({
        //     // chatId: chatId,
        //     from: { $ne: new ObjectId(userId) },
        //     kind: { $ne: 'generic' },
        //     status: {
        //         $elemMatch: {
        //             user: new ObjectId(userId),
        //             read: { $eq: null }
        //         }
        //     }
        // });

        const aggregate = this.model.aggregate([
            // unwind the history array 
            {
                $match: {
                    active: true,
                    // deleted: false,
                    members: {
                        $elemMatch: {
                            $and: [{ user: { $eq: new ObjectId(userId) } }, { user: { $exists: true } }],
                            canChat: true,
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'messages',
                    let: {
                        chatId: '$_id'
                    },
                    pipeline: [{
                        $match: {
                            $expr: {
                                $and: [{
                                    $ne: [
                                        '$from', new ObjectId(userId)
                                    ]
                                }, {
                                    $eq: [
                                        '$chatId', '$$chatId'
                                    ]
                                }, {
                                    $eq: [
                                        '$deleted.date', null
                                    ]
                                }]
                            }
                        }
                    },
                    {
                        $unwind: {
                            path: '$status',
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    {
                        $match: {
                            'status.read': {
                                $eq: null
                            }
                        }
                    },
                    {
                        $group: {
                            _id: "$_id"
                        }
                    }
                    ],
                    as: 'unreadMessages'
                }
            },
            {
                $addFields: {
                    unreadMessages: {
                        $size: '$unreadMessages'
                    }
                }
            },

            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$unreadMessages"
                    }
                }
            },
            {
                $project: {
                    total: {
                        _id: 0
                    }
                }
            }
        ])

        return new Promise( async (resolve, reject) => {
            try {
                const result = await aggregate.exec()
                if (result.length > 0) {
                    console.log(`TOtal Unread messages: ${result[0].total} at ${Date.now()}`)
                    // console.log(`Result: ${JSON.stringify(result, null, 14)}`);
                    resolve(result[0].total);
                } else {
                    resolve(0);
                }
            } catch (ex) {
                console.error('Error: ' + ex.message)
                resolve(0);
            }
        }) 
    }

    /**
     * Total unread chats for a user
     *
     * @param {*} userId
     * @memberof ChatService
     */
    async countTotalUnreadChatsForUser(userId) {
        if (typeof userId === 'number') {
            const userService = new UserService(UserModel);
            userId = await userService.getUserIds([userId]);
        }

        return new Promise((resolve) => {
            this.model.aggregate([
                {
                    '$match': {
                        'active': true,
                        'members': {
                            '$elemMatch': {
                                'user': new ObjectId(userId),
                                'canChat': true,
                                //   'options.blocked': false
                            }
                        }
                    }
                }, {
                    '$lookup': {
                        'from': 'messages',
                        'let': {
                            'chatId': '$_id'
                        },
                        'pipeline': [
                            {
                                '$match': {
                                    '$expr': {
                                        '$and': [
                                            {
                                                '$ne': [
                                                    '$from', new ObjectId(userId)
                                                ]
                                            }, {
                                                '$eq': [
                                                    '$chatId', '$$chatId'
                                                ]
                                            },
                                            // {
                                            //     '$ne': [
                                            //         '$kind', 'generic'
                                            //     ]
                                            // },
                                            {
                                                $eq: [
                                                    '$deleted.date', null
                                                ]
                                            }
                                        ]
                                    }
                                }
                            }, {
                                '$unwind': {
                                    'path': '$status',
                                    'preserveNullAndEmptyArrays': false
                                }
                            }, {
                                '$match': {
                                    'status.read': {
                                        '$eq': null
                                    }
                                }
                            }, {
                                '$group': {
                                    '_id': '$_id'
                                }
                            }
                        ],
                        'as': 'unreadMessages'
                    }
                }, {
                    '$addFields': {
                        'unreadMessages': {
                            '$size': '$unreadMessages'
                        }
                    }
                }, {
                    '$match': {
                        'unreadMessages': {
                            '$gt': 0
                        }
                    }
                }, {
                    '$count': 'total'
                }
            ])
                .then((result) => {
                    if (result.length) {
                        const total = result[0].total;
                        console.log(`Total Unread: ${JSON.stringify(total)} for user: ${userId}`)
                        resolve(total);
                    } else {
                        resolve(0);
                        console.log(`No Unread Chats`)
                    }
                }).catch(err => {
                    console.error(`Error counting chats for user: ${userId}. Error: ${err.message}`)
                    resolve(0);
                });
        });
    }

    getAllMessagesWithChatsFromMySQL() {
        return this.model.findAll({
            // limit: 10
        });
    }

    async getByImportedId(importedGroupId) {

        return new Promise((resolve, reject) => {
            const query = {
                isImported: true,
                id: importedGroupId
            };

            this.model.findOne(query).lean().then((chat) => {
                if (chat) {
                    resolve(chat);
                } else {
                    reject(new Error('Chat not found'))
                }
            }).catch(err => reject(err));
        });
    }

    async getByUniqueId(uniqueId) {

        return new Promise((resolve, reject) => {
            const query = {
                isImported: true,
                uniqueId: uniqueId
            };

            this.model.findOne(query).lean().then((chat) => {
                if (chat) {
                    resolve(chat);
                } else {
                    reject(new Error(`Chat not found: ${uniqueId}`))
                }
            }).catch(err => {
                console.log(`Error while getting chat with unique: ${uniqueId}`);
                reject(err);
            });
        });
    }

    /**
     * Get chat by id
     *
     * @param {*} chatId
     * @returns
     * @memberof ChatService
     */
    async getChatById(chatId) {
        return new Promise((resolve, reject) => {
            const query = {
                _id: chatId
            };

            this.model
                .findOne(query)
                // .select('_id id name members lastMessage type imageUrl createdOn deleted deletedOn')
                .select(utils.chatColumnsToShow())
                .populate({
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl device'
                })
                .populate({
                    path: 'lastMessage',
                    select: utils.messageColumnsToShow(),
                    // select: '_id id content kind sentOn from',
                    populate: {
                        path: 'from reactions',
                        select: utils.userColumnsToShow() + utils.reactionColumnsToShow(),
                        populate: {
                            path: 'from',
                            select: utils.userColumnsToShow()
                        }
                    }
                })
                .lean()
                .exec((err, chat) => {
                    if (err) return reject(err);

                    if (!chat) return reject(new Error('No chat found for given id'));

                    if (!chat.active && chat.deleted) {
                        return reject(new Error('Chat is not active, because it is deleted'));
                    }

                    resolve(chat);
                });
        });
    }

    async getOnlyChat(id) {
        return new Promise((resolve, reject) => {
            const query = {
                _id: id
            };

            this.model
                .findOne(query)
                // .select('_id id name members lastMessage type imageUrl createdOn deleted deletedOn')
                .select(utils.chatColumnsToShow())
                .populate({
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl device'
                })
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
                .exec((err, chat) => {
                    if (err) return reject(err);

                    if (!chat) return reject(new Error('No chat found for given id'));

                    resolve(chat);
                });
        });
    }

    async updatePrivateChatMembersToActive(chatId) {
        return new Promise((resolve, reject) => {
            const date = Date.now();
            const filter = { _id: chatId, 'members.canChat': { $eq: false } };
            const update = { $set: { 'members.$.canChat': true, 'members.$.joinedOn': date, 'members.$.updatedOn': date } };

            this.model.findOneAndUpdate(filter, update, { new: true })
                .populate({
                    path: "members.user",
                    select: utils.userColumnsToShow()
                    // select: '_id id name email phone imageUrl device'
                })
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
                .lean()
                .then(chat => {
                    if (chat) {
                        resolve(chat);
                    } else {
                        reject(new Error('Nothing to update'));
                    }
                }).catch(err => {
                    reject(err);
                });
        });
    }

    /**
     * 
     *
     * @param {*} data
     * @return {*} 
     * @memberof ChatService
     */
    async updateChatWithPublicKey(data) {
        return new Promise((resolve, reject) => {
            const date = Date.now();
            const query = { _id: data.chatId };
            const update = { $set: { 'publicKey': data.publicKey } };

            this.model.findOneAndUpdate(query, update).lean().then(chat => {
                if (chat) {
                    resolve(chat);
                } else {
                    reject(new Error('Nothing to update for chat'));
                }
            }).catch(err => {
                reject(err);
            });
        });
    }
}

module.exports = ChatService;