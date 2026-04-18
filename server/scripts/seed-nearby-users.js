/**
 * seed-nearby-users.js
 *
 * Creates 10 fake active users placed at varying distances around
 * the reference coordinates (37.44273, -121.930138 — Fremont, CA).
 *
 * Usage:
 *   node server/scripts/seed-nearby-users.js
 *
 * Requires MONGO_HOST in server/.env.local (loaded automatically).
 */

require('dotenv').config({ path: `${__dirname}/../.env.local` });

const mongoose = require('mongoose');

// ─── Models (inline — no circular deps) ──────────────────────────────────────

const LocationSchema = new mongoose.Schema({
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    point: {
        type:        { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [lon, lat]
    },
    recordedAt: { type: Date, default: Date.now }
});
LocationSchema.index({ point: '2dsphere' });

const UserSchema = new mongoose.Schema({
    name:        { type: String, default: null },
    email:       { type: String, default: null },
    imageUrl:    { type: String, default: null },
    bio:         { type: String, default: null },
    gender:      { type: String, enum: ['male', 'female', 'other', null], default: null },
    age:         { type: Number, default: null },
    dateOfBirth: { type: Date, default: null },
    interestedIn:{ type: String, enum: ['women', 'men', 'everyone', null], default: null },
    status:      { type: String, enum: ['active', 'blocked', 'inactive', null], default: 'active' },
    isPublic:    { type: Boolean, default: false },
    lastLogin:   { type: Date, default: null },
    registeredOn:{ type: Date, default: Date.now },
    updatedOn:   { type: Date, default: null },
    location:    { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
    radar: {
        show:      { type: Boolean, default: true },
        updatedOn: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
    },
    visibilityPreferences: {
        womenOnly: { type: Boolean, default: false },
        menOnly:   { type: Boolean, default: false },
        photoBlur: { type: Boolean, default: false },
    },
    notificationPreferences: {
        newMessages:          { type: Boolean, default: true },
        chatRequests:         { type: Boolean, default: true },
        connectionRequests:   { type: Boolean, default: true },
        nearbyWinks:          { type: Boolean, default: true },
        sound:                { type: Boolean, default: true },
        vibration:            { type: Boolean, default: true },
        badge:                { type: Boolean, default: true },
    },
    privacySettings: {
        showBio:      { type: Boolean, default: true },
        showAge:      { type: Boolean, default: true },
        showGender:   { type: Boolean, default: true },
        showLocation: { type: Boolean, default: true },
        showContact:  { type: Boolean, default: true },
    },
    deleted:    { type: Boolean, default: false },
});

const Location = mongoose.models.Location || mongoose.model('Location', LocationSchema);
const User     = mongoose.models.User     || mongoose.model('User', UserSchema);

// ─── Reference point ─────────────────────────────────────────────────────────
// Fremont, CA — matches the location doc in the DB.

const BASE_LAT = 37.44273;
const BASE_LON = -121.930138;

/**
 * Offset lat/lon by the given metres in the north and east directions.
 * Approximation — fine for short distances.
 */
function offset(lat, lon, northMetres, eastMetres) {
    const dLat = northMetres / 111_320;
    const dLon = eastMetres  / (111_320 * Math.cos(lat * (Math.PI / 180)));
    return [lat + dLat, lon + dLon];
}

// ─── Seed data ────────────────────────────────────────────────────────────────
// Presets (metres):  here ≤ 23m · nearby ≤ 91m · walkable ≤ 305m · local ≤ 805m

const SEEDS = [
    // --- here (< 23 m) ---
    {
        name: 'Ana K.', email: 'ana.k@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=ana-k',
        bio: 'Coffee lover. Always chasing the next great espresso.',
        gender: 'female', age: 24, dateOfBirth: new Date('2001-06-15'),
        interestedIn: 'men', isPublic: true,
        lastLogin: new Date(Date.now() - 5 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: false },
        north:  12, east:  10,  // ~16 m
    },
    {
        name: 'Dion R.', email: 'dion.r@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=dion-r',
        bio: 'Musician. Guitar by day, jazz by night.',
        gender: 'male', age: 29, dateOfBirth: new Date('1996-02-28'),
        interestedIn: 'women', isPublic: false,
        lastLogin: new Date(Date.now() - 12 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: true },
        north: -15, east:  15,  // ~21 m
    },

    // --- nearby (23 – 91 m) ---
    {
        name: 'Lena M.', email: 'lena.m@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=lena-m',
        bio: 'Yoga & hiking. Sunrise hikes are my therapy.',
        gender: 'female', age: 27, dateOfBirth: new Date('1998-09-03'),
        interestedIn: 'everyone', isPublic: true,
        lastLogin: new Date(Date.now() - 30 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: true },
        privacySettings: { showBio: true, showAge: false, showGender: true, showLocation: true, showContact: false },
        north: -45, east:  35,  // ~57 m
    },
    {
        name: 'Mark T.', email: 'mark.t@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=mark-t',
        bio: 'Startup founder. Building things that matter.',
        gender: 'male', age: 31, dateOfBirth: new Date('1994-11-19'),
        interestedIn: 'women', isPublic: true,
        lastLogin: new Date(Date.now() - 2 * 60 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: false, showContact: false },
        north:  20, east: -80,  // ~82 m
    },

    // --- walkable (91 – 305 m) ---
    {
        name: 'Sara B.', email: 'sara.b@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=sara-b',
        bio: null,
        gender: 'female', age: 22, dateOfBirth: new Date('2003-04-07'),
        interestedIn: 'men', isPublic: false,
        lastLogin: new Date(Date.now() - 45 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: true },
        north: 120, east:  80,  // ~144 m
    },
    {
        name: 'Bled A.', email: 'bled.a@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=bled-a',
        bio: 'Architect. I design spaces that breathe.',
        gender: 'male', age: 33, dateOfBirth: new Date('1992-07-22'),
        interestedIn: 'women', isPublic: true,
        lastLogin: new Date(Date.now() - 3 * 60 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: true },
        north: -210, east:  60,  // ~218 m
    },
    {
        name: 'Nita V.', email: 'nita.v@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=nita-v',
        bio: 'Medical student. Coffee IV, please.',
        gender: 'female', age: 23, dateOfBirth: new Date('2002-01-30'),
        interestedIn: 'everyone', isPublic: true,
        lastLogin: new Date(Date.now() - 20 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: true },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: false },
        north:  80, east: -280,  // ~291 m
    },

    // --- local (305 – 805 m) ---
    {
        name: 'Julia S.', email: 'julia.s@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=julia-s',
        bio: 'Street photography. Finding stories in strangers.',
        gender: 'female', age: 26, dateOfBirth: new Date('1999-12-05'),
        interestedIn: 'men', isPublic: true,
        lastLogin: new Date(Date.now() - 10 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: true },
        north: 350, east: -150,  // ~380 m
    },
    {
        name: 'Elton G.', email: 'elton.g@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=elton-g',
        bio: null,
        gender: 'male', age: 28, dateOfBirth: new Date('1997-08-14'),
        interestedIn: 'women', isPublic: false,
        lastLogin: new Date(Date.now() - 6 * 60 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: false, showAge: true, showGender: true, showLocation: true, showContact: false },
        north: -500, east:  250,  // ~559 m
    },
    {
        name: 'Mira D.', email: 'mira.d@example.com',
        imageUrl: 'https://i.pravatar.cc/300?u=mira-d',
        bio: 'Chef & food blogger. Eat well, live well.',
        gender: 'female', age: 30, dateOfBirth: new Date('1995-03-18'),
        interestedIn: 'men', isPublic: true,
        lastLogin: new Date(Date.now() - 1 * 60 * 60_000),
        radar: { show: true },
        visibilityPreferences: { womenOnly: false, menOnly: false, photoBlur: false },
        privacySettings: { showBio: true, showAge: true, showGender: true, showLocation: true, showContact: true },
        north:  600, east: -500,  // ~781 m
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
    await mongoose.connect(process.env.MONGO_HOST, {
        retryWrites: true,
        w: 'majority',
        serverSelectionTimeoutMS: 10_000,
    });
    console.log('✓ Connected to MongoDB');

    // ─── Cleanup old seeded users ─────────────────────────────────────────────
    const seedNames = SEEDS.map(s => s.name);
    const oldUsers  = await User.find({ name: { $in: seedNames } }).select('_id');
    const oldIds    = oldUsers.map(u => u._id);
    if (oldIds.length) {
        await Location.deleteMany({ user: { $in: oldIds } });
        await User.deleteMany({ _id: { $in: oldIds } });
        console.log(`✓ Removed ${oldIds.length} old seeded users`);
    }

    let created = 0;

    for (const s of SEEDS) {
        const [lat, lon] = offset(BASE_LAT, BASE_LON, s.north, s.east);

        // Create user first (no location ref yet)
        const user = await User.create({
            name:        s.name,
            email:       s.email,
            imageUrl:    s.imageUrl,
            bio:         s.bio,
            gender:      s.gender,
            age:         s.age,
            dateOfBirth: s.dateOfBirth,
            interestedIn: s.interestedIn,
            status:      'active',
            isPublic:    s.isPublic,
            lastLogin:   s.lastLogin,
            registeredOn: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60_000),
            radar:       s.radar,
            visibilityPreferences:   s.visibilityPreferences,
            notificationPreferences: { newMessages: true, chatRequests: true, connectionRequests: true, nearbyWinks: true, sound: true, vibration: true, badge: true },
            privacySettings: s.privacySettings,
            deleted: false,
        });

        // Create location doc pointing back to the user
        const loc = await Location.create({
            user:  user._id,
            point: { type: 'Point', coordinates: [lon, lat] },
        });

        // Link location to user
        await User.findByIdAndUpdate(user._id, { location: loc._id });

        const approxM = Math.round(Math.sqrt(s.north ** 2 + s.east ** 2));
        console.log(`  ✓ ${s.name.padEnd(12)} (${s.gender}, ${s.age})  ~${approxM} m  [${lat.toFixed(5)}, ${lon.toFixed(5)}]`);
        created++;
    }

    console.log(`\n✓ Seeded ${created} users around (${BASE_LAT}, ${BASE_LON})`);
    await mongoose.disconnect();
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
