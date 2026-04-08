const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate');

const Message = new Schema({
    // This id is for current messages from the other DB 
    tempId: { type: String, default: null }, 
    content: { type: String, required: false, default: null },
    from: { type: Schema.Types.ObjectId, ref: 'User' }, 
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat' },
    sentOn: { type: Date, default: Date.now },
    kind: { type: String, enum: ['text', 'image', 'video', 'audio', 'document', 'GIF', 'generic', 'share contact'], default: 'text' },
    deleted: {
        forEveryone: { type: Boolean, default: null },
        forMyself: { type: Boolean, default: null },
        by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        date: { type: Date, default: null }
    },
    editedOn: { type: Date, default: null, required: false },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: [
        {
            user: { type: Schema.Types.ObjectId, ref: "User" },
            sent: { type: Date, default: Date.now },
            delivered: { type: Date, default: null },
            read: { type: Date, default: null }
        }
    ],
    reactions: [{ type: Schema.Types.ObjectId, ref: 'Reaction', default: null }],
    media: [{ type: Schema.Types.ObjectId, ref: 'Media', default: null }],
    isImported: { type: Boolean, default: false },
    importedOn: { type: Date, default: null },
    summary: { type: String, default: null },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
    sharedContact: { type: Object, default: null },
    visible: { type: Boolean, default: true },
    encrypted: { type: Boolean, default: false }
});

Message.plugin(mongoosePaginate);

mongoose.model('Message', Message);