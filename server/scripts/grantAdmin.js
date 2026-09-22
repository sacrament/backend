/**
 * Create (or update) an admin login — the only way an Admin doc gets
 * created, since no HTTP route does it. Admins are their own standalone
 * identity, unrelated to the User collection — they log in via
 * POST /api/admin/login with the email/password set here.
 *
 * Usage:
 *   node server/scripts/grantAdmin.js <email> <password>
 *   node server/scripts/grantAdmin.js <email> --revoke
 *
 * Safe to re-run — upserts by email, so re-running with a new password
 * rotates it, and --revoke just flips `active` to false rather than
 * deleting the doc.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const mongoose = require('mongoose');
require('../models/admin');
const { hashPassword } = require('../utils/password');

const Admin = mongoose.model('Admin');

async function run() {
    const email = process.argv[2];
    const revoke = process.argv.includes('--revoke');
    const password = revoke ? null : process.argv[3];

    if (!email || (!revoke && !password)) {
        console.error('Usage: node server/scripts/grantAdmin.js <email> <password>');
        console.error('       node server/scripts/grantAdmin.js <email> --revoke');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_HOST);
    console.log('Connected to MongoDB');

    const normalizedEmail = email.toLowerCase().trim();

    if (revoke) {
        const existing = await Admin.findOneAndUpdate(
            { email: normalizedEmail },
            { $set: { active: false } },
            { new: true }
        );
        if (!existing) {
            console.error(`No admin found for ${normalizedEmail}`);
            await mongoose.disconnect();
            process.exit(1);
        }
        console.log(`✓ Revoked admin ${existing.email}`);
        console.log({ _id: existing._id, email: existing.email, active: existing.active });
        await mongoose.disconnect();
        console.log('Done.');
        return;
    }

    const admin = await Admin.findOneAndUpdate(
        { email: normalizedEmail },
        { $set: { active: true, passwordHash: hashPassword(password) }, $setOnInsert: { email: normalizedEmail } },
        { upsert: true, new: true, runValidators: true }
    );

    console.log(`✓ Created/updated admin ${admin.email}`);
    console.log({ _id: admin._id, email: admin.email, active: admin.active });

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
