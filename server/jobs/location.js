/**
 * Location Jobs
 *
 * Marks stale location documents as no longer current.
 * Runs every 5 minutes — any location not updated in the last hour
 * has isCurrent flipped to false.
 */

const mongoose = require('mongoose');

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

module.exports = (agenda) => {
    agenda.define('location:expire-stale', async () => {
        const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

        await mongoose.model('Location').updateMany(
            { isCurrent: true, recordedAt: { $lt: cutoff } },
            { $set: { isCurrent: false } }
        );
    });

    agenda.every('5 minutes', 'location:expire-stale');
};
