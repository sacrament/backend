const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const E2EEKeyBackup = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    salt: { type: String, required: true },
    nonce: { type: String, required: true },
    ciphertext: { type: String, required: true },
    tag: { type: String, required: true },
    version: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
});

mongoose.model('E2EEKeyBackup', E2EEKeyBackup);
