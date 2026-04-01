const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MemberSchema = new Schema({
    user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    canChat:   { type: Boolean, default: true,  index: true },
    canCall:   { type: Boolean, default: false, index: true },
    canVideo:  { type: Boolean, default: false, index: true },
    joinedOn:  { type: Date, default: Date.now },
    updatedOn: { type: Date, default: null },
    leftOn:    { type: Date, default: null },
    options: {
        favorite: { type: Boolean, default: false },
        blocked:  { type: Boolean, default: false },
        muted:    { type: Boolean, default: false },
    }
}, { _id: false });

const ChatSchema = new Schema({
    uniqueId:    { type: String, default: null, unique: true, sparse: true },
    members:     {
        type: [MemberSchema],
        validate: {
            validator: v => v.length === 2,
            message: 'A private chat must have exactly 2 members'
        }
    },
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    active:      { type: Boolean, default: true },
    publicKey:   { type: String, default: null },
    summary:     { type: String, default: null },
}, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

ChatSchema.index({ 'members.user': 1 });

mongoose.model('Chat', ChatSchema);
