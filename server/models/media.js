const mongoose = require('mongoose');
const Schema = mongoose.Schema;  

const Media = new Schema({ 
    message: { type: String, index: true, unique: true}, 
    name: { type: String, default: null },
    url: { type: String, default: null },
    from: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['audio', 'image', 'video', 'GIF', 'document'] },
    editedOn: { type: Date, default: null },
    isImported: { type: Boolean, default: false},
    importedOn: { type: Date, default: null },
    thumbnail: { type: String, default: null }
});  
 
mongoose.model('Media', Media); 

module.exports = Media;
 