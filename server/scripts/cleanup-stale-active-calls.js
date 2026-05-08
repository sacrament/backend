/**
 * cleanup-stale-active-calls.js
 *
 * One-time maintenance utility to close stale CallHistory rows that still look active
 * (`status` in ringing/answered and `endedAt` is null).
 *
 * Usage:
 *   node server/scripts/cleanup-stale-active-calls.js --dry-run
 *   node server/scripts/cleanup-stale-active-calls.js
 *
 * Optional env vars:
 *   STALE_PENDING_MINUTES=2   // roomId missing/null
 *   STALE_ROOM_MINUTES=30     // roomId present
 */

require('dotenv').config({ path: `${__dirname}/../.env.local` });
require('dotenv').config({ path: `${__dirname}/../.env` });

const mongoose = require('mongoose');

async function run() {
    const isDryRun = process.argv.includes('--dry-run');
    const mongoHost = process.env.MONGO_HOST;

    if (!mongoHost) {
        throw new Error('MONGO_HOST is not set. Check server/.env.local or server/.env');
    }

    const stalePendingMinutes = Number(process.env.STALE_PENDING_MINUTES || 2);
    const staleRoomMinutes = Number(process.env.STALE_ROOM_MINUTES || 30);

    const pendingCutoff = new Date(Date.now() - stalePendingMinutes * 60 * 1000);
    const roomCutoff = new Date(Date.now() - staleRoomMinutes * 60 * 1000);

    await mongoose.connect(mongoHost, {
        retryWrites: true,
        w: 'majority',
        serverSelectionTimeoutMS: 10000,
    });

    require('../models/calls/history');
    const CallHistory = mongoose.model('CallHistory');

    const query = {
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
    };

    const staleCalls = await CallHistory.find(query)
        .select('_id roomId status answered answeredAt startedAt from to')
        .sort({ startedAt: 1 })
        .lean();

    console.log(`[cleanup-stale-active-calls] dryRun=${isDryRun} candidates=${staleCalls.length}`);

    if (!staleCalls.length) {
        console.log('[cleanup-stale-active-calls] nothing to update');
        return;
    }

    const nowMs = Date.now();
    let endedCount = 0;
    let missedCount = 0;

    const ops = staleCalls.map((call) => {
        const wasAnswered = call.answered === true;
        const status = wasAnswered ? 'ended' : 'missed';
        const durationSeconds = wasAnswered && call.answeredAt
            ? Math.max(0, Math.round((nowMs - new Date(call.answeredAt).getTime()) / 1000))
            : null;

        if (status === 'ended') {
            endedCount += 1;
        } else {
            missedCount += 1;
        }

        return {
            updateOne: {
                filter: { _id: call._id, endedAt: null, status: { $in: ['ringing', 'answered'] } },
                update: {
                    $set: {
                        endedAt: new Date(),
                        status,
                        durationSeconds,
                    },
                },
            },
        };
    });

    console.log(`[cleanup-stale-active-calls] planned ended=${endedCount} missed=${missedCount}`);

    if (isDryRun) {
        const sample = staleCalls.slice(0, 10).map((c) => ({
            id: c._id.toString(),
            roomId: c.roomId || null,
            status: c.status,
            answered: !!c.answered,
            startedAt: c.startedAt,
        }));
        console.log('[cleanup-stale-active-calls] sample:', JSON.stringify(sample, null, 2));
        return;
    }

    const result = await CallHistory.bulkWrite(ops, { ordered: false });
    const modified = result.modifiedCount || 0;
    console.log(`[cleanup-stale-active-calls] updated=${modified}`);
}

run()
    .then(async () => {
        await mongoose.connection.close();
        console.log('[cleanup-stale-active-calls] done');
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('[cleanup-stale-active-calls] failed:', error.message);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(1);
    });
