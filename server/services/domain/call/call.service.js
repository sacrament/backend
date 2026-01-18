

const config = require('../../../utils/config');
const twilio = require('twilio');
const client = twilio(config.TWILIO.ACCOUNTSID, config.TWILIO.AUTHTOKEN)
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const CallHistory = mongoose.model('CallHistory'); 
const ChatService = require('../chat/chat.service');
 
const helper = require('../../../utils/index');

class CallService extends ChatService {

    /**
     * INFO
     *  this.model => 'Is a chat model' 
     * @memberof CallService
     */  

    /**
     *
     *
     * @param {*} identity
     * @returns
     * @memberof CallService
     */
    async getAccessToken(identity) {
        console.log('Get user access token for twilio');
        return new Promise((resolve, reject) => {
            if (!identity) {
                console.error('Identity can`t be empty');
                reject(new Error('Identity can`t be empty'));
            }
            // Used when generating any kind of tokens
            const accountSid = config.TWILIO.ACCOUNTSID;
            const apiKey = config.TWILIO.API_KEY;
            const apiSecret = config.TWILIO.API_KEY_SECRET;

            // Create an access token which we will sign and return to the client,
            // containing the grant we just created
            const token = new AccessToken(accountSid, apiKey, apiSecret);
            token.identity = identity;

            const videoGrant = new VideoGrant();
            token.addGrant(videoGrant);
            let jwt = token.toJwt();
            // console.log('Token:' + jwt);
            resolve({jwt: jwt, token: token});
        });
    } 

    /**
     * Create room call
     *
     * @returns
     * @memberof CallService
     */
    async createCallRoom(caller, callee) {
        const uniqueId = helper.uniqueId() //`R${caller}E${callee}`;
        console.log(`Call ID: ${uniqueId}`)
        return new Promise((resolve, reject) => {
            client.video.rooms.create({
                enableTurn: true,
                statusCallback: config.ENV_NAME == 'development' ? 'http://192.168.100.51:3001/api/call/details' : 'https://chat.winky.com/api/call/details',
                type: 'peer-to-peer',
                uniqueName: uniqueId,
            }).then(async call => {
                const token = await this.getAccessToken(uniqueId);

                let jwt = token.jwt;
                if (jwt == undefined) {
                    jwt = token.toJwt(); 
                }
                // console.log(`Call Info: ${JSON.stringify(call, undefined, 14)}`)
                console.log(`Call Info: ${call.sid}`)
                resolve({call: call, token: jwt});
                this.addCall({
                    roomId: call.sid,
                    type: 'outgoing',
                    from: caller,
                    to: callee,
                    date: Date.now(),
                    userName: uniqueId,
                    description: JSON.stringify(call),
                    token: jwt,
                    other: JSON.stringify(token)
                })
            }).catch(err => {
                console.error(`Error while creating room: ${JSON.stringify(err, undefined, 4)}`)
                reject(err);
                this.addCall({
                    roomId: call.sid,
                    type: 'error',
                    from: caller,
                    to: callee,
                    date: Date.now(),
                    userName: uniqueId,
                    description: err.message
                })
            });
        });
    }

    /**
     * Invite others to join
     *
     * @param {*} roomId
     * @param {*} caller
     * @param {*} callee
     * @returns
     * @memberof CallService
     */
    async call(roomId, caller, callee) {
        // Lookup the call
        return new Promise((resolve, reject) => {
            client.video.rooms(roomId).fetch().then(async call => {
                if (call) {
                    // get the token from db
                    // const callHistory = await this.getCall(roomId);
                    const token = await this.getAccessToken(callee);
                    let jwt = token.jwt; 
                    if (jwt == undefined) {
                        jwt = token.toJwt(); 
                    }

                    resolve({call: call, token: jwt });

                    this.addCall({
                        roomId: call.sid,
                        type: 'incoming',
                        from: caller,
                        to: callee,
                        date: Date.now(),
                        userName: call.uniqueName,
                        token: jwt,
                        description: JSON.stringify(call), 
                        other: JSON.stringify(token)
                    });
                    // Store the call in db
                } else {
                    reject('No room found');
                }
            }).catch(err => {
                reject(`Unexpected error occurred: ${err.message}`)
            });
        });
    }

    /**
     * Complete call ( room )
     *
     * @param {*} id
     * @returns
     * @memberof CallService
     */
    async completeRoom(id) { 
        return new Promise((resolve, reject) => {
            client.video.rooms(id).update({
                status: "completed"
            }).then(call => {
                // console.log(`Call Completed: ${JSON.stringify(call, undefined, 4)}`)
                console.log(`Call Completed: ${call.sid}`)
                resolve(call);
                // this.callStatusUpdate({
                //     roomId: id,
                //     type: "ended",
                //     other: 'user ended'
                // })
            }).catch(err => {
                console.error(`Error while completing room: ${JSON.stringify(err, undefined, 4)}`)
                reject(err);
            });
        });
    }

    /**
     * Call history for a user
     *
     * @param {*} user
     * @returns
     * @memberof CallService
     */
    async getHistory(user) {
        console.log(`Getting call history for: ${user}`);
        return new Promise((resolve, reject) => {
            CallHistory.find({ from: user })
            .select('-__v')
            .populate({
                path: "from to",
                select: '_id id name email phone imageUrl device'
            })
            .lean()
            .then((calls) => {
                resolve(calls);
            }).catch(err => {
                reject(err);
            });
        });
    }

    /**
     * Add a call to db
     *
     * @param {*} data
     * @returns
     * @memberof CallService
     */
    async addCall(data) {
        console.log(`Adding info for call: ${data.type}`);
        const call = new CallHistory();
        call.roomId = data.roomId;
        call.date = data.date;
        call.type = data.type;
        call.from = data.from;
        call.to = data.userId || data.to;
        call.userName = data.userName;
        call.description = data.description || null;
        call.other = data.other || null;
        call.token = data.token;

        return new Promise((resolve, reject) => {
            call.save(err => {
                if (err) {
                    return reject(err);
                }

                resolve({status: 'Call added to history'});
            });
        });
    }

    /**
     * Get call history details by room Id
     *
     * @param {*} roomId
     * @returns
     * @memberof CallService
     */
    async getCall(roomId) {
        console.log(`~Get info for call: ${roomId}`);
        return new Promise((resolve, reject) => {
            CallHistory.findOne({ roomId: roomId })
            .select('-__v')
            .populate({
                path: "from to",
                select: '_id id name email phone imageUrl device'
            })
            .lean()
            .then((call) => {
                resolve(call);
            }).catch(err => {
                reject(err);
            });
        });
    }

    /**
     * Call status details from Twilio
     *
     * @param {*} callDetails
     * @returns
     * @memberof CallService
     */
    async callStatusUpdate(callDetails) {
        console.log(`Call status update info for call: ${callDetails.RoomSid}`);
        const roomId = callDetails.RoomSid || callDetails.roomId;
        let type = 'initiated'

        if (callDetails.RoomStatus) {
            if (callDetails.RoomStatus == 'completed') {
                type = 'ended'
            }
        }

        return new Promise((resolve, reject) => {
            CallHistory.findOneAndUpdate({ roomId: roomId }, { type: type, date: callDetails.Timestamp || callDetails.date, duration: callDetails.RoomDuration }, { new: true }).then(call => {
                if (call) {
                    console.log(`Call has been updated: ${type}`);
                    resolve(call);
                } else {
                    console.log(`No call found for room: ${roomId}`);
                    reject(`No call found for room: ${roomId}`);
                }
            }).catch(err => {
                console.error(`Error occurred while updating call status: ${err.message}`);
                reject(err.message);
            });
        }); 
    };

    /**
     * ENd an active call
     *
     * @param {*} callId
     * @returns
     * @memberof CallService
     */
    async endCall(callId, callee, caller) {
        return new Promise((resolve, reject) => {
            client.video.rooms(callId).update({
                status: "completed"
            }).then( async call => { 
                // const token = await this.getAccessToken(callee);
                // let jwt = token.jwt;
                // if (jwt == undefined) {
                //     jwt = token.toJwt();
                // }
                console.log(`Call Ended: ${call.sid}`)
                resolve(call); 
                this.addCall({
                    roomId: call.sid,
                    type: 'ended',
                    from: caller,
                    to: callee,
                    date: Date.now(),
                    userName: call.uniqueName,
                    // token: jwt,
                    description: JSON.stringify(call), 
                    // other: JSON.stringify(token)
                });
            }).catch(err => {
                console.error(`Error while ending call room: ${JSON.stringify(err, undefined, 4)}`)
                reject(err);
            });
        });
    }
}

module.exports = CallService;
