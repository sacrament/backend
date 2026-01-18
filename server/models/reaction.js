const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const Reaction = new Schema({
    message: { type: Schema.Types.ObjectId, ref: 'Message' },
    from: { type: Schema.Types.ObjectId, ref: 'User'},
    date: { type: Date, default: null },
    kind: { type: String, enum: ['love', 'like', 'dislike', 'laugh', 'question', 'curious']},
    editedOn: { type: Date, default: null },
    chatId: { type: String } // Requested by Vllado
}); 
 
// Reaction.index({ from: 1, kind: 1, message: 1 }, { unique: true });

mongoose.model('Reaction', Reaction); 
 