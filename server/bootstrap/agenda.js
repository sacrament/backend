/**
 * Agenda Singleton — v6
 *
 * MongoDB-backed job scheduler. One instance shared across the process.
 * Import getAgenda() anywhere to enqueue or schedule jobs.
 *
 * Usage:
 *   const { getAgenda } = require('../bootstrap/agenda');
 *
 *   await getAgenda().now('push:connection-request', { request });
 *   await getAgenda().schedule('in 10 minutes', 'push:request-reminder', { ... });
 *   await getAgenda().every('1 hour', 'cleanup:expired-sessions', {});
 */

const { Agenda } = require('agenda');
const { MongoBackend } = require('@agendajs/mongo-backend');

/** @type {Agenda | null} */
let _agenda = null;

const initAgenda = async () => {
    if (_agenda) return _agenda;

    _agenda = new Agenda({
        backend: new MongoBackend({
            address: process.env.MONGO_HOST,
            collection: 'jobs',
        }),
        processEvery: '10 seconds',
        maxConcurrency: 20,
        defaultConcurrency: 5,
    });

    require('../jobs/notifications')(_agenda);
    require('../jobs/location')(_agenda);

    await _agenda.start();
    console.log('✓ Agenda job scheduler started');

    return _agenda;
};

/** @returns {Agenda} */
const getAgenda = () => {
    if (!_agenda) throw new Error('Agenda not initialized — call initAgenda() at startup');
    return _agenda;
};

const stopAgenda = async () => {
    if (!_agenda) return;
    await _agenda.stop();
    _agenda = null;
    console.log('✓ Agenda stopped');
};

module.exports = { initAgenda, getAgenda, stopAgenda };
