const utils = require('../../../utils/index'); 
const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const ChatModel = mongoose.model('Chat');
const MessageModel = mongoose.model('Message');
const { ChatService } = require('../../../services');
const ChatServiceDB = require('../../../services/domain/chat/chat.service.db');
const MessageServiceDB = require('../../../services/domain/chat/message.service.db');
const { UserService } = require('../../../services');
const CS = require('../../chat.service');
const VoipPushNotificationService = require('../../../notifications/voip');
const { CallService } = require('../../../services');
const PushNotificationService = require('../../../notifications');

let ChatSocketService; 

module.exports = class Calls {
    constructor(io) { 
        ChatSocketService = new CS(io);
        this.handler = {
            'create room': createRoom,
            'call': call,
            'complete room': completeRoom,
            'end': endCall
        }; 
    };
}

/**
 * Create a call room
 *
 * @param {*} data
 * @param {*} ack
 */
const createRoom = async function(data, ack) {
    try {
        console.log(`Create Room: ${JSON.stringify(data)}`)

        const callService = new CallService(ChatModel);
        let caller = this.user.id;
        data.caller = caller;

        let callee = data.userId;

        if (typeof callee === 'number') {
            const userService = new UserService(UserModel);
            callee = await userService.getUserIds([callee]);
        }

        if (typeof caller === 'number') {
            const userService = new UserService(UserModel);
            caller = await userService.getUserIds([caller]);
        }

        // Create the call
        callService.createCallRoom(caller, callee).then(async result => {
            console.log(`Room is created`);
            const { call, token }  = result;

            ack({call: call, token: token});

            // const isUserConnected = await ChatSocketService.isUserConnected(callee);

            // if (isUserConnected) {
            //     // Send the message to online users
            //     this.to(callee).emit('incoming call', {
            //         call: call,
            //         token: token
            //     });
            // } else {  
            //     // MARK: Send the VOIP Push 
            //     console.log(`Sending VOIP notification`);
            //     const voipPushNotification = new VoipPushNotificationService();
            //     await voipPushNotification.incomingCall({
            //         call: call,
            //         token: token,
            //         from: caller,
            //         to: callee
            //     })
            // }
        }).catch(err => {
            ack(err);
        });
    } catch (ex) {
        ack(ex.message);
    } 
}

/**
 * After room creation, caller emits 'call' to the callee.
 * At this stage, 'caller' is connected to the room and awaits the 'callee' to join
 *
 * @param {*} data
 * @param {*} ack
 */
const call = async function(data, ack) {
    try {
        console.log(`Make Call: ${JSON.stringify(data)}`)

        const callService = new CallService(ChatModel);
        let caller = this.user.id;
        // data.caller = from;
        const roomId = data.roomId;
        let callee = data.userId;
        const mode = data.mode; 
        const userService = new UserService(UserModel);

        if (typeof callee === 'number') {
            callee = await userService.getUserIds([callee]);
        }

        if (typeof caller === 'number') { 
            caller = await userService.getUserIds([caller]);
        }

        callService.call(roomId, caller, callee).then(async result => {
            const { call, token }  = result;
            const isUserConnected = await ChatSocketService.isUserConnected(callee);
            const fromObject = await userService.getUserById(caller, true);
            const toObject = await userService.getUserById(callee, true);

            if (isUserConnected) {
                // Send the message to online users
                this.to(callee).emit('incoming call', {
                    call: call, 
                    from: fromObject,
                    token: token,
                    mode: mode
                });

                ack({call: call, mode: mode, isCalleeOnline: true});
            } else {  
                // MARK: Send the VOIP Push 
                if (toObject.device.type == "ANDROID") {
                    const pushNotificationService = new PushNotificationService();
                    pushNotificationService.incomingCall({
                        call: call,
                        from: fromObject,
                        to: toObject,
                        mode: mode,
                        token: token
                    });
                } else {
                    console.log(`Sending VOIP notification`);
                    const voipPushNotification = new VoipPushNotificationService();
                    await voipPushNotification.incomingCall({
                        call: call, 
                        from: fromObject,
                        to: toObject,
                        mode: mode,
                        token: token
                    })
                } 

                ack({call: call, mode: mode, isCalleeOnline: false});
            }
        }).catch(err => {
            console.error(`Error occurred while calling room ${roomId}: Error: ${err}`);
            ack(err);
        });
    } catch (ex) {
        console.error(`General Error occurred while calling room ${roomId}: Error: ${ex.message}`);
        ack(ex);
    }
}

/**
 * End call
 *
 * @param {*} data
 * @param {*} ack
 */
const endCall = async function(data, ack) {
    try {
        console.log(`End Call: ${JSON.stringify(data)}`)

        const callService = new CallService(ChatModel);
        let caller = this.user.id;
        // data.caller = from;
        const roomId = data.roomId;
        let callee = data.userId;
        const mode = data.mode;
        const callAnswered = data.callAnswered;

        const userService = new UserService(UserModel);

        if (typeof callee === 'number') {
            callee = await userService.getUserIds([callee]);
        }

        if (typeof caller === 'number') { 
            caller = await userService.getUserIds([caller]);
        }

        callService.endCall(roomId, callee, caller).then(async result => {
            const call = result;
            const isUserConnected = await ChatSocketService.isUserConnected(callee);
            const fromObject = await userService.getUserById(caller, true);
            const toObject = await userService.getUserById(callee, true);

            ack({call: call, mode: mode, isCalleeOnline: isUserConnected});

            if (isUserConnected) {
                // Send the message to online users
                this.to(callee).emit('end call', {
                    call: call, 
                    from: fromObject,
                    // token: token,
                    mode: mode
                }); 
            } else {   
                if (fromObject.device.type == "ANDROID") {
                    const pushNotificationService = new PushNotificationService();
                    await pushNotificationService.endCall({
                        call: call,
                        from: fromObject,
                        to: toObject,
                        mode: mode,
                        // token: token
                    });
                } else {
                    
                    if (!callAnswered) {
                        console.log(`Sending VOIP notification`);
                        const voipPushNotification = new VoipPushNotificationService();
                        await voipPushNotification.endCall({
                            call: call,
                            from: fromObject,
                            to: toObject,
                            mode: mode, 
                        });
                        // const pushNotificationService = new PushNotificationService();
                        // await pushNotificationService.missedCall({
                        //     call: call,
                        //     from: fromObject,
                        //     to: toObject,
                        //     mode: mode,
                        // });
                    }
                }
            }
        }).catch(err => {
            console.error(`Error occurred while ending call room ${roomId}: Error: ${err}`);
            ack(err);
        });
    } catch (ex) {
        console.error(`General Error occurred while ending calling room ${roomId}: Error: ${ex.message}`);
        ack(ex);
    }
}

/**
 * End call
 *
 * @param {*} data
 * @param {*} ack
 */
const completeRoom = async function(data, ack) {
    try {
        console.log(`Complete End Call: ${JSON.stringify(data)}`)

        const callService = new CallService(ChatModel); 
        const roomId = data.roomId; 
        // Create the call
        callService.completeRoom(roomId).then(call => {
            console.log(`Room ${roomId} is completed. End call`);
            ack(call)
        }).catch(err => {
            console.error(`Error occurred while ending call for room ${roomId}`);
            ack(err);
        });
    } catch (ex) {
        console.error(`General Error occurred while ending call for room ${roomId}`);
        ack(ex.message);
    } 
}