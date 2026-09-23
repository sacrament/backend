/**
 * Location Jobs
 *
 * Marks stale location documents as no longer current.
 * Runs every minute — a location is only flipped to isCurrent=false when BOTH
 * its recordedAt AND its owner's lastSeen are more than an hour old. A user who is
 * still active (socket connect, presence heartbeat, any location ping refreshes
 * lastSeen) keeps their current location even if the coordinates themselves are old;
 * the nearby query's own lastSeen window decides whether they are shown.
 */

const mongoose = require('mongoose');

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

module.exports = (agenda) => {
    agenda.define('location:expire-stale', async () => {
        const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
        const Location = mongoose.model('Location');

        const stale = await Location.aggregate([
            { $match: { isCurrent: true, recordedAt: { $lt: cutoff } } },
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'owner' } },
            {
                $match: {
                    $or: [
                        { owner: { $size: 0 } },                       // orphaned location
                        { 'owner.0.lastSeen': null },                  // never seen
                        { 'owner.0.lastSeen': { $exists: false } },
                        { 'owner.0.lastSeen': { $lt: cutoff } },       // owner inactive too
                    ],
                },
            },
            { $project: { _id: 1 } },
        ]);

        if (stale.length === 0) return;

        await Location.updateMany(
            { _id: { $in: stale.map((l) => l._id) } },
            { $set: { isCurrent: false } }
        );
    });

    agenda.every('1 minute', 'location:expire-stale');
};
