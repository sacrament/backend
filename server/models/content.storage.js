const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const ContentStorage = new Schema({
    message: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    chat: { type: Schema.Types.ObjectId, ref: 'Chat', default: null },
    from: { type: Schema.Types.ObjectId, ref: 'User'},
    receiver: { type: Schema.Types.ObjectId, ref: 'User'},
    action: { type: String, enum: ['new', 'edit', 'delete', 'other']},
    date: { type: Date, default: Date.now },
    description: { type: String, default: null }
}); 

mongoose.model('ContentStorage', ContentStorage); 
 