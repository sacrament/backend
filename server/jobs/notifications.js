/**
 * Notification Jobs
 *
 * Agenda job definitions for push notifications.
 * Errors are intentionally not caught here — Agenda marks failed jobs
 * and handles retries automatically.
 *
 * Enqueue from anywhere:
 *   const { getAgenda } = require('../startup/agenda');
 *
 *   await getAgenda().now('push:connection-request', { request });
 *   await getAgenda().now('push:connection-request-response', { from, to, request, response });
 *   await getAgenda().schedule('in 10 minutes', 'push:connection-request-reminder', { from, request, to });
 */

const push = require('../notifications');

const JOBS = [
    {
        name: 'push:connection-request',
        handler: ({ request }) => push.newConnectionRequest(request),
    },
    {
        name: 'push:connection-request-response',
        handler: ({ from, to, request, response }) => push.respondConnectionRequest(from, to, request, response),
    },
    {
        name: 'push:connection-request-cancelled',
        handler: ({ request }) => push.cancellConnectionRequest(request),
    },
    {
        name: 'push:connection-request-reminder',
        handler: ({ from, request, to }) => push.reminderForConnectionRequest(from, request, to),
    },
    {
        name: 'push:undo-connection',
        handler: ({ from, request, to }) => push.undoConnectionFriendship(from, request, to),
    },
];

module.exports = (agenda) => {
    for (const { name, handler } of JOBS) {
        agenda.define(name, async (job) => {
            await handler(job.attrs.data);
        });
    }
};
