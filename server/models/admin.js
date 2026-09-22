const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Standalone admin identity — intentionally NOT linked to the User collection.
// Someone operating the admin panel isn't an app user with a phone-based
// account; they log in with email/password via POST /api/admin/login (see
// server/api/routes/admin.js) and get back their own JWT (`verifyAdminToken`
// in server/middleware/verify.js), separate from the mobile-app user token.
// Provisioned only via server/scripts/grantAdmin.js — there is no HTTP route
// that creates one.
const Admin = new Schema({
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    active:       { type: Boolean, default: true },
    note:         { type: String, default: null }
}, { timestamps: true });

mongoose.model('Admin', Admin);
