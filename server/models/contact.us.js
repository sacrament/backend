const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContactUs = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, default: null },
    message: { type: String, required: true },
    emailSent: { type: Boolean, default: false },
}, { timestamps: true });

mongoose.model('ContactUs', ContactUs);
