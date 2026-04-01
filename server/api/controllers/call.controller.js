const CallService = require('../../services/domain/call/call.service');
const PushNotificationService = require('../../services/external/push/push.service');
const CS = require('../../socket');
const UserService = require('../../services/domain/user/user.service');  

const callService = new CallService();
const userService = new UserService();
const pushService = new PushNotificationService();

const getAccessToken = (req, res) => {
    let identity = req.decodedToken.userId;

    callService.getAccessToken(identity).then((token) => {
        res.status(200).json({status: 'success', token});
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message});
    });
};

const bindDevice = async (req, res) => {
    const bind = {
        identity: req.decodedToken.userId,
        type: req.body.type,
        token: req.body.token
    }; 

    pushService.bindDevice(bind).then((binding) => {
        res.status(200).json({status: 'success', sid: binding.sid});
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message});
    });
 
    await userService.updateVoipDeviceToken(bind.identity, bind.token);
};

const unbindDevice = (req, res) => {
    let sid = req.body.sid;
    let userId = req.decodedToken.userId

    pushService.unbindDevice(sid, userId).then(() => {
        res.status(200).json({status: 'success'});
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message});
    });
};

const sendNotification = (req, res) => {
    let userId = req.decodedToken.userId;
    let recipient = req.body.recipient;
    let title = req.body.title;
    let body = req.body.body;
    let data = req.body.data;

    let notification = {identity: recipient, title, body, data: {data}}; 

    //MARK: TODO: Store call to db

    pushService.send(userId, notification).then((notification) => {
        res.status(200).json({status: 'success', sid: notification.sid});
    }).catch((err) => {
        res.status(500).json({status: 'error', message: err.message});
    });
};

const declineCall = async (req, res) => {
    const userId = req.decodedToken.userId;
    let { to, callId } = req.body; 

    if (typeof to === 'number') { 
        to = await userService.getUserIds([to]);
    }

    const IO = req.app.get('socketIO'); 
    const socketService = new CS(IO);   
    const memberIsOnline = await socketService.isUserConnected(to);
    if (memberIsOnline) {
        IO.to(to).emit('call declined', { from: userId, callID: callId });
    }
    res.status(200).json({status: 'success'}); 
}

const storeCallInfo = async (req, res) => {
    let { date, type, userId, userName, description, other } = req.body;
    
    if (typeof userId === 'string') {
        userId = await userService.getUserIds([userId]);
    }

    let user = req.decodedToken.userId;
    if (typeof user === 'number') { 
        user = await userService.getUserIds([user]);
    }

    const data = {
        date: date, 
        type: type,
        userId: userId,
        from: user,
        userName: userName, 
        description: description,
        other: other
    }
    
    callService.addCall(data).then(result => {
        res.status(200).json({status: 'success', calls: result}); 
    }).catch(err => res.status(400).json({status: 'error', message: err.message}))
}

const callHistory = async (req, res) => {
    let userId = req.decodedToken.userId;
    if (typeof userId === 'number') { 
        userId = await userService.getUserIds([userId]);
    } 
    callService.getHistory(userId).then(result => {
        res.status(200).json({status: 'success', calls: result}); 
    }).catch(err => res.status(400).json({status: 'error', message: err.message}))
}

const callDetails = async (req, res) => {
    const roomId = req.params.roomId; 
    callService.getCall(roomId).then(result => {
        res.status(200).json({status: 'success', call: result}); 
    }).catch(err => res.status(400).json({status: 'error', message: err.message}))
}

const twilioCallStatusCallbackDetails = async (req, res) => {
    // console.log(`Call details from Twilio: ${JSON.stringify(req.body, undefined, 4)}`)
    const data = req.body; 

    await callService.callStatusUpdate(data);
//     AccountSid:"REDACTED"
    // RoomDuration:"53"
    // RoomName:"8443cd50-8c5b-11ea-b67d-6579b9d10666"
    // RoomSid:"RMde13251738d900f62d650ab98b022795"
    // RoomStatus:"completed"
    // RoomType:"peer-to-peer"
    // SequenceNumber:"1"
    // StatusCallbackEvent:"room-ended"
    // Timestamp:"2020-05-02T09:59:42.091Z"
}

module.exports = { 
    bindDevice,
    unbindDevice,
    sendNotification,
    getAccessToken,
    declineCall,
    callHistory,
    twilioCallStatusCallbackDetails,
    storeCallInfo,
    callDetails
};
