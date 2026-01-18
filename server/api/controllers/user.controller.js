
const mongoose = require('mongoose');    
const UserService = require('../../services/domain/user/user.service');
const UserModel = mongoose.model('User');

const ChatService = require('../../services/domain/chat/chat.service');
const ChatServiceDB = require('../../services/domain/chat/chat.service.db');
const ChatModel = mongoose.model('Chat');
const BlockUserModel = mongoose.model('BlockUser');
const randomstring = require("randomstring");
const { newToken } = require('../../middleware/verify');

const ReactionModel = mongoose.model('Reaction');
const MediaModel = mongoose.model('Media');
const CallHistoryModel = mongoose.model('CallHistory');
const ContentStorageModel = mongoose.model('ContentStorage');

const UserRequestModel = mongoose.model('ContentStorage');


const newUser = async (req, res) => {
    const { user } = req.body;  
    // Get chat service instance
    const userService = new UserService(UserModel);     

    // Save the chat
    userService.newUser(user).then((result) => {
        res.status(200).json({status: 'success', result: result })
    }).catch((err) => { 
        res.status(500).json({status: 'error', message: err.message})
    });
}

/**
 * 
 *
 * @param {*} req
 * @param {*} res
 */
const updateDeviceToken = async (req, res) => { 
    const userId = req.decodedToken.userId;
    const { deviceToken, devicePlatform } = req.body
    // Get chat service instance
    const userService = new UserService(UserModel);     

    // Update device 
    userService.updateDeviceToken(userId, deviceToken, devicePlatform).then((result) => {
        res.status(200).json({status: 'success', result: result })
    }).catch((err) => { 
        res.status(500).json({status: 'error', message: err.message})
    })   
}

/**
 * Verify user's phone numbers against Winky account
 *
 * @param {*} req
 * @param {*} res
 */
const verifyUsers = async (req, res) => {
    try {
        const { phones } = req.body
        // Get chat service instance
        const userService = new UserService(UserModel);
        const result = await userService.verifyUsersByPhone(phones);
        if (result) {
            res.status(200).json({status: 'success', result })
        }
    }  catch (ex) {
        res.status(500).json({status: 'error', message: ex.message})
    } 
}

const sendSMSToUsers = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { phones } = req.body
        // Get chat service instance
        const userService = new UserService(UserModel);
        const result = await userService.sendSMS(userId, phones);
        if (result) {
            res.status(200).json({status: 'success', result: result })
        }
    }  catch (ex) {
        res.status(500).json({status: 'error', message: ex.message})
    } 
}

const enableDevice = async (req, res) => { 
    const userId = req.decodedToken.userId;
    const { deviceToken } = req.body
    // Get chat service instance
    const userService = new UserService(UserModel);     

    // Update device 
    userService.enableDeviceForUser(userId, deviceToken).then((result) => {
        res.status(200).json({status: 'success', result: result })
    }).catch((err) => { 
        res.status(500).json({status: 'error', message: err.message})
    })   
}

const disableDevice = async (req, res) => { 
    const userId = req.decodedToken.userId; 
    // Get chat service instance
    const userService = new UserService(UserModel);     

    // Update device 
    userService.disableUserDeviceFor(userId).then((result) => {
        res.status(200).json({status: 'success', result: result })
    }).catch((err) => { 
        res.status(500).json({status: 'error', message: err.message})
    })   
}

/**
 *
 *
 * @param {*} req
 * @param {*} res
 */
const refreshAuthToken = async (req, res) => {
    const { oldToken, userId } = req.body;

    if (oldToken) {
        const user = {
            "userId": userId,
            "scopes": "access"
        }
        
        const token = await newToken(user);
        const refreshToken = randomstring.generate()
        res.status(200).json({ status: "success", token: token, refreshToken: refreshToken })
        //save it to db
        const userService = new UserService(UserModel);   
        userService.saveRefreshToken(userId, refreshToken);
    } else {
        res.status(401).json({status: 'error', message: "No old token provided"});
    }
}

const getBlockedUsers = async (req, res) => { 
    const userId = req.decodedToken.userId;
    const userService = new UserService(BlockUserModel); 
    
    userService.getAllBlockedUsers(userId).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message})
    });
}

const blockUser = (req, res) => { 
    const token = req.authToken;
    let user = req.decodedToken;
    user.token = token;

    const { userId, reason, description } = req.body;

    const userService = new UserService(BlockUserModel);  
    const parsedId = parseInt(userId);
    userService.blockUser(parsedId, user, reason, description).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message})
    });
};

const unblockUser = (req, res) => { 
    const token = req.authToken;
    let user = req.decodedToken;
    user.token = token;
    const { userId } = req.body;
    const userService = new UserService(BlockUserModel); 
    
    const parsedId = parseInt(userId);
    userService.unblockUser(parsedId, user).then((result) => {
        res.status(200).json({status: 'success', result: result})
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message})
    });
};
 
const contentStorage = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const userService = new UserService(UserModel);
        const result = await userService.getContentStorageFor(userId);

        res.status(200).json({status: 'success', result: result});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

const deleteContentById = async (req, res) => {
    try {
        const userId = req.decodedToken.userId;
        const { id } = req.body;
        const userService = new UserService(UserModel);
        const result = await userService.deleteMessageObjectBy(id);

        res.status(200).json({status: 'success', result: result});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

const getUnreadMessagesForUser = async (req, res) => { 
    try { 
        const userId = req.decodedToken.userId;
        const chatService = new ChatService(ChatModel);
        const result = await chatService.countUnreadMessagesForUser(userId);

        res.status(200).json({status: 'success', result: result});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

const me = async (req, res) => {
    try { 
        let userId = req.decodedToken.userId;
        const userService = new UserService(UserModel);

        if (typeof userId === 'number') {
            userId = await userService.getUserIds([userId]);
        }

        let result = await userService.getUserById(userId);
        const showRadar = result.radar.show;

        delete result.radar;

        result.showRadar = showRadar;

        res.status(200).json({status: 'success', user: result});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

const updateRadar = async(req, res) => {
    try { 
        let userId = req.decodedToken.userId;
        const { status } = req.body;
        const userService = new UserService(UserModel);

        if (typeof userId === 'number') {
            userId = await userService.getUserIds([userId]);
        }

        let result = await userService.updateRadar(userId, status)  
        const showRadar = result.radar.show;

        delete result.radar;

        result.showRadar = showRadar;

        res.status(200).json({status: 'success', user: result});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

const deleteAccount = async (req, res) => {
    try {
        let userId = req.decodedToken.userId;
        const userService = new UserService(UserModel);
        const chatServiceDb = new ChatServiceDB(ChatModel);

        if (typeof userId === 'number') {
            userId = await userService.getUserIds([userId]);
        }

        const chatstDeleted = await chatServiceDb.deleteAllChatsForUser(userId);
        const userAccountDeleted = await userService.deleteAccount(userId);

        res.status(200).json({status: 'success', result: { totalChatsDeleted: chatstDeleted, userAccountDeleted }});
    } catch (ex) {
        res.status(400).json({ status: 'error', message: ex.message });
    }
}

module.exports = {
    newUser, 
    updateDeviceToken, 
    verifyUsers, 
    sendSMSToUsers, enableDevice, disableDevice, refreshAuthToken, 
    getBlockedUsers, blockUser, unblockUser, contentStorage, 
    deleteContentById, getUnreadMessagesForUser, me, updateRadar, deleteAccount
}