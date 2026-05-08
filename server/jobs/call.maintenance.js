/**
 * Call Maintenance Jobs
 *
 * Self-heals stale CallHistory rows that remain active after abnormal call flow exits.
 * Runs every hour.
 */

const mongoose = require('mongoose');

const STALE_PENDING_MINUTES = Number(process.env.STALE_PENDING_MINUTES || 2);
const STALE_ROOM_MINUTES = Number(process.env.STALE_ROOM_MINUTES || 60);

module.exports = (agenda) => {
    agenda.define('calls:cleanup-stale-active', async () => {
        const now = Date.now();
        const pendingCutoff = new Date(now - STALE_PENDING_MINUTES * 60 * 1000);
        const roomCutoff = new Date(now - STALE_ROOM_MINUTES * 60 * 1000);
        const CallHistory = mongoose.model('CallHistory');

        const staleCalls = await CallHistory.find({
            status: { $in: ['ringing', 'answered'] },
            endedAt: null,
            $or: [
                {
                    $and: [
                        {
                            $or: [
                                { roomId: null },
                                { roomId: '' },
                                { roomId: { $exists: false } },
                            ],
                        },
                        { startedAt: { $lte: pendingCutoff } },
                    ],
                },
                {
                    $and: [
                        { roomId: { $nin: [null, ''] } },
                        { startedAt: { $lte: roomCutoff } },
                    ],
                },
            ],
        })
            .select('_id answered answeredAt')
            .lean();

        if (!staleCalls.length) {
            return;
        }

        const endedAt = new Date();
        const ops = staleCalls.map((call) => {
            const wasAnswered = call.answered === true;
            const durationSeconds = wasAnswered && call.answeredAt
                ? Math.max(0, Math.round((now - new Date(call.answeredAt).getTime()) / 1000))
                : null;

            return {
                updateOne: {
                    filter: {
                        _id: call._id,
                        endedAt: null,
                        status: { $in: ['ringing', 'answered'] },
                    },
                    update: {
                        $set: {
                            endedAt,
                            status: wasAnswered ? 'ended' : 'missed',
                            durationSeconds,
                        },
                    },
                },
            };
        });

        const result = await CallHistory.bulkWrite(ops, { ordered: false });
        const modifiedCount = result.modifiedCount || 0;
        if (modifiedCount > 0) {
            console.log(`[calls:cleanup-stale-active] cleaned ${modifiedCount} stale call(s)`);
        }
    });

    agenda.every('1 hour', 'calls:cleanup-stale-active');
};
