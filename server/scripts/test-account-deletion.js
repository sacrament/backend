/**
 * Exercises the account deletion cascade and the moderation retention rules
 * against a real MongoDB.
 *
 * Runs in an isolated database on the configured cluster (winky_deletion_test),
 * which is created and dropped by this script. It never touches the app database.
 *
 *   node scripts/test-account-deletion.js
 */

const mongoose = require('mongoose');
const config = require('../utils/config');

const TEST_DB = 'winky_deletion_test';

// Every model the cascade reaches must be registered before the services load.
const MODELS = [
    'user', 'deleted.user', 'device', 'location', 'chat', 'message', 'media',
    'reaction', 'content.storage', 'report', 'user.ban', 'moderation.log',
    'user.blocked', 'user.muted', 'user.disappeared', 'user.saved',
    'user.request', 'user.connect', 'user.session', 'profile.view',
    'nearby.users.log', 'pending.socket.event', 'e2ee.device',
    'e2ee.key.backup', 'key.backup', 'key.escrow',
    'calls/history', 'calls/request',
];

let passed = 0, failed = 0;

function check(label, condition, detail = '') {
    if (condition) { passed++; console.log(`  ok    ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
    MODELS.forEach(m => require(`../models/${m}`));

    const uri = config.MONGODB.HOST;
    if (!uri) throw new Error('MONGO_HOST is not set');

    await mongoose.connect(uri, { dbName: TEST_DB });
    console.log(`connected to isolated database: ${TEST_DB}\n`);

    // Guard: never run against the app database by accident.
    if (mongoose.connection.name !== TEST_DB) {
        throw new Error(`refusing to run against database "${mongoose.connection.name}"`);
    }

    await mongoose.connection.dropDatabase();

    const M = name => mongoose.model(name);
    const oid = () => new mongoose.Types.ObjectId();

    // ─── Seed ─────────────────────────────────────────────────────────────────
    const victim = await M('User').create({ name: 'Stays', partition: 'hash-stays' });
    const leaver = await M('User').create({
        name: 'Leaves',
        email: 'Leaves@Example.com ',
        partition: 'hash-leaves',
        appleId: 'apple-123',
        country: 'XK',
        gender: 'female',
        age: 29,
        interestedIn: 'everyone',
        registeredOn: new Date(Date.now() - 100 * 86400000),
    });

    const chat = await M('Chat').create({
        members: [
            { user: victim._id, canChat: true },
            { user: leaver._id, canChat: true },
        ],
    });

    const keptMessage = await M('Message').create({
        content: 'this must survive', from: leaver._id, chatId: chat._id, senderCopy: 'sender-only-copy',
    });
    await M('Message').create({ content: 'from the other side', from: victim._id, chatId: chat._id });

    await M('Device').create({ user: leaver._id, token: 'tok', platform: 'iOS' });
    await M('Location').create({ user: leaver._id, point: { type: 'Point', coordinates: [1, 2] } });
    await M('ProfileView').create({ viewer: leaver._id, viewed: victim._id });
    await M('BlockUser').create({ blocker: leaver._id, blocked: oid() });
    await M('E2EEDevice').create({ user: leaver._id, registrationId: 1, identityKey: 'k', signedPreKey: { id: 1, publicKey: 'p', signature: 's' } });
    await M('CallHistory').create({ from: leaver._id, to: victim._id, roomId: 'r1', ipAddress: '1.2.3.4', networkInfo: 'wifi' });
    await M('CallRequest').create({ from: leaver._id, to: victim._id, requestId: 'req-1' });
    await M('User').updateOne({ _id: victim._id }, { $push: { favorites: leaver._id } });

    // Reports: one they filed, one against them.
    const filed = await M('Report').create({ reporter: leaver._id, reported: victim._id, type: 'spam', reason: 'spam' });
    const against = await M('Report').create({ reporter: victim._id, reported: leaver._id, type: 'harassment', reason: 'harassment' });

    // ─── Run deletion ─────────────────────────────────────────────────────────
    const AccountDeletionService = require('../services/domain/user/account.deletion.service');
    const result = await new AccountDeletionService().deleteAccount(leaver._id, 'User initiated');

    console.log('deletion:', result.status, '\n');
    console.log('account and identifiers removed:');
    check('user document gone', !(await M('User').findById(leaver._id)));
    check('device gone', (await M('Device').countDocuments({ user: leaver._id })) === 0);
    check('locations gone', (await M('Location').countDocuments({ user: leaver._id })) === 0);
    check('key material gone', (await M('E2EEDevice').countDocuments({ user: leaver._id })) === 0);
    check('profile views gone', (await M('ProfileView').countDocuments({ viewer: leaver._id })) === 0);
    check('blocks gone', (await M('BlockUser').countDocuments({ blocker: leaver._id })) === 0);
    check('call request gone', (await M('CallRequest').countDocuments({ from: leaver._id })) === 0);
    check('pulled from favorites',
        !(await M('User').findById(victim._id)).favorites.some(f => f.equals(leaver._id)));

    console.log('\nother party keeps their history:');
    const survived = await M('Message').findById(keptMessage._id);
    check('message row retained', !!survived);
    check('message content retained', survived?.content === 'this must survive', `got ${survived?.content}`);
    check('senderCopy dropped', survived?.senderCopy == null, `got ${survived?.senderCopy}`);
    const call = await M('CallHistory').findOne({ roomId: 'r1' });
    check('call history retained', !!call);
    check('call ipAddress stripped', call?.ipAddress == null);
    check('call networkInfo stripped', call?.networkInfo == null);
    const membership = (await M('Chat').findById(chat._id)).members.find(m => m.user.equals(leaver._id));
    check('chat membership retained', !!membership);
    check('membership is read-only', membership?.canChat === false);

    console.log('\ntombstone:');
    const tomb = await M('DeletedUser').findOne({ userId: leaver._id });
    check('tombstone written', !!tomb);
    check('phoneHash copied from partition', tomb?.phoneHash === 'hash-leaves', `got ${tomb?.phoneHash}`);
    check('email stored only as a hash',
        !!tomb?.emailHash && !String(tomb.emailHash).includes('@'), `got ${tomb?.emailHash}`);
    check('appleId hashed', !!tomb?.appleIdHash && tomb.appleIdHash !== 'apple-123');
    check('age bucketed not exact', tomb?.ageBucket === '25-34', `got ${tomb?.ageBucket}`);
    check('no name retained', !('name' in (tomb?.toObject() ?? {})));
    check('messagesSent counted', tomb?.activity?.messagesSent === 1, `got ${tomb?.activity?.messagesSent}`);
    check('accountAgeDays computed', tomb?.accountAgeDays === 100, `got ${tomb?.accountAgeDays}`);
    check('country carried onto tombstone', tomb?.country === 'XK', `got ${tomb?.country}`);

    const { countryFromPhone } = require('../utils/phone.country');
    check('country derived from calling code', countryFromPhone('+38344123456') === 'XK');
    check('longest prefix wins over +1', countryFromPhone('+12425550100') === 'BS');
    check('unknown code yields null', countryFromPhone('+999123') === null);

    console.log('\nsafety records:');
    const filedAfter = await M('Report').findById(filed._id);
    check('report they filed retained', !!filedAfter);
    check('reporter anonymised', filedAfter?.reporter == null, `got ${filedAfter?.reporter}`);
    check('report against them retained', !!(await M('Report').findById(against._id)));

    console.log('\nidempotency:');
    const second = await new AccountDeletionService().deleteAccount(leaver._id, 'User initiated');
    check('second call is a no-op', second.status === 'already_deleted', `got ${second.status}`);

    // ─── Moderation retention ─────────────────────────────────────────────────
    console.log('\nmoderation retention:');
    const ReportService = require('../services/domain/report/report.service');
    const svc = new ReportService();
    const reviewer = await M('User').create({ name: 'Reviewer', partition: 'hash-reviewer' });
    const target = await M('User').create({ name: 'Target', partition: 'hash-target' });

    const r1 = await M('Report').create({ reporter: reviewer._id, reported: target._id, type: 'spam', reason: 'spam' });
    await svc.updateReportStatus(r1._id, 'resolved', 'temporary_restriction', reviewer._id);
    const resolved = await M('Report').findById(r1._id);
    check('purgeAt set on resolve', !!resolved.purgeAt);
    const days = Math.round((resolved.purgeAt - resolved.resolvedOn) / 86400000);
    check('resolved retention is 365 days', days === 365, `got ${days}`);

    const ban = await M('UserBan').findOne({ userId: target._id, active: true });
    check('action created a real ban', !!ban);
    check('temporary restriction has an expiry', !!ban?.expiresAt);

    const r2 = await M('Report').create({ reporter: reviewer._id, reported: target._id, type: 'spam', reason: 'spam' });
    await svc.updateReportStatus(r2._id, 'dismissed', 'dismissed', reviewer._id);
    const dismissed = await M('Report').findById(r2._id);
    const dDays = Math.round((dismissed.purgeAt - dismissed.reviewedOn) / 86400000);
    check('dismissed retention is 90 days', dDays === 90, `got ${dDays}`);

    console.log('\nrate limit and dedupe:');
    const reporter2 = await M('User').create({ name: 'Reporter2', partition: 'hash-r2' });
    const target2 = await M('User').create({ name: 'Target2', partition: 'hash-t2' });
    const first = await svc.createReport({ reporterId: reporter2._id, reportedId: target2._id, type: 'spam', reason: 'spam' });
    const dupe = await svc.createReport({ reporterId: reporter2._id, reportedId: target2._id, type: 'spam', reason: 'again' });
    check('duplicate collapsed into one record', String(first._id) === String(dupe._id));
    check('occurrences incremented', dupe.occurrences === 2, `got ${dupe.occurrences}`);
    check('only one report stored',
        (await M('Report').countDocuments({ reporter: reporter2._id })) === 1);

    let limited = false;
    for (let i = 0; i < 12; i++) {
        try {
            const t = await M('User').create({ name: `T${i}`, partition: `hash-t-${i}` });
            await svc.createReport({ reporterId: reporter2._id, reportedId: t._id, type: 'spam', reason: 'spam' });
        } catch (e) { if (e.code === 'REPORT_RATE_LIMIT') { limited = true; break; } throw e; }
    }
    check('daily rate limit rejects', limited);

    console.log('\nban evasion:');
    // auth.service exports a singleton, not a class.
    const auth = require('../services/domain/auth/auth.service');
    const bannedUser = await M('User').create({ name: 'Banned', partition: 'hash-banned' });
    await M('UserBan').create({ userId: bannedUser._id, reason: 'test', active: true });
    await new AccountDeletionService().deleteAccount(bannedUser._id, 'User initiated');

    let refused = false;
    try { await auth.assertNotBanEvading('hash-banned'); }
    catch (e) { refused = e.httpStatus === 403; }
    check('banned number refused after deletion', refused);

    let allowed = true;
    try { await auth.assertNotBanEvading('hash-leaves'); }
    catch { allowed = false; }
    check('clean deleted number allowed back', allowed);

    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
    console.error('\nTEST ERROR:', err);
    try { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } catch {}
    process.exit(1);
});
