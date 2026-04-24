const mongoose = require('mongoose');

class PendingSocketEventService {
    get model() {
        return mongoose.model('PendingSocketEvent');
    }

    async queue(userId, event, payload) {
        return this.model.create({ userId, event, payload });
    }

    async queueMany(userIds, event, payload) {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return [];
        }

        return this.model.insertMany(
            userIds.map((userId) => ({ userId, event, payload })),
            { ordered: false }
        );
    }

    async consumeForUser(userId) {
        const events = await this.model.find({ userId }).sort({ createdAt: 1 }).lean();
        if (events.length === 0) {
            return [];
        }

        await this.model.deleteMany({ _id: { $in: events.map((event) => event._id) } });
        return events;
    }
}

module.exports = PendingSocketEventService;