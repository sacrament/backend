const CallService = require('../../services/domain/call/call.service');
const CS = require('../../socket');
const UserService = require('../../services/domain/user/user.service');
const logger = require('../../utils/logger');

const callService = new CallService();
const userService = new UserService();

const getAccessToken = (req, res) => {
    let identity = req.decodedToken.userId;

    callService.getAccessToken(identity).then((token) => {
        res.status(200).json({status: 'success', token});
    }).catch((err) => {
        logger.error('Get access token error:', err);
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
    }).catch(err => {
        logger.error('Store call info error:', err);
        res.status(400).json({status: 'error', message: err.message});
    })
}

const callHistory = async (req, res) => {
    let userId = req.decodedToken.userId;
    if (typeof userId === 'number') {
        userId = await userService.getUserIds([userId]);
    }
    callService.getHistory(userId).then(result => {
        res.status(200).json({status: 'success', calls: result});
    }).catch(err => {
        logger.error('Call history error:', err);
        res.status(400).json({status: 'error', message: err.message});
    })
}

const callDetails = async (req, res) => {
    const roomId = req.params.roomId;
    callService.getCall(roomId).then(result => {
        res.status(200).json({status: 'success', call: result});
    }).catch(err => {
        logger.error('Call details error:', err);
        res.status(400).json({status: 'error', message: err.message});
    })
}

const getCallRequests = async (req, res) => {
    let userId = req.decodedToken.userId;
    if (typeof userId === 'number') {
        userId = await userService.getUserIds([userId]);
    }

    const { response } = req.query;

    try {
        const requests = await callService.getCallRequests(userId, response);
        res.status(200).json({ status: 'success', requests });
    } catch (err) {
        logger.error('Get call requests error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

const twilioCallStatusCallbackDetails = async (req, res) => {
    const data = req.body;

    // logger.info(`[Twilio webhook] headers: ${JSON.stringify(req.headers)}`);
    logger.info(`[Twilio webhook] body: ${JSON.stringify(data)}`);

    try {
        await callService.callStatusUpdate(data);
        res.status(200).json({ status: 'success' });
    } catch (err) {
        logger.error('Twilio status callback error:', err);
        // Still return 200 so Twilio does not retry
        res.status(200).json({ status: 'error', message: err.message });
    }
}

/**
 * POST /api/call/deleteByUser
 * Body: { userId }
 * Deletes all call history records where from or to matches userId.
 */
const deleteCallsByUser = async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' });

    try {
        const mongoose = require('mongoose');
        const CallHistory = mongoose.model('CallHistory');
        const result = await CallHistory.deleteMany({ $or: [{ from: userId }, { to: userId }] });
        return res.status(200).json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        logger.error('Delete calls by user error:', error);
        return res.status(500).json({ status: 'error', message: 'Failed to delete calls' });
    }
};

module.exports = {
    getAccessToken,
    declineCall,
    callHistory,
    twilioCallStatusCallbackDetails,
    storeCallInfo,
    callDetails,
    deleteCallsByUser,
    getCallRequests,
};
