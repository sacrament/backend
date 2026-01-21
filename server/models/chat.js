const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ChatSchema = new Schema({
  id: { type: Number, default: null, index: true },
  uniqueId: { type: String, default: null, unique: true },
  name: { type: String, required: false, index: true },
  imageUrl: { type: String, default: null }, 
  createdOn: { type: Date, default: Date.now },
  updatedOn: { type: Date, default: null },
  type: { type: String, enum: ["group", "private"], default: "private" },
  editedOn: { type: Date, default: null },
  editedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  //Chat members
  members: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User", index: true },
      canChat: { type: Boolean, default: true, index: true },
      // Permission system: Chat -> Calls -> Video progression
      canCall: { type: Boolean, default: false, index: true },
      canVideo: { type: Boolean, default: false, index: true },
      joinedOn: { type: Date, default: Date.now },
      // This is when a user has triggered any action based below: mute, favourite, admin or blocked the chat
      updatedOn: { type: Date, default: null },
      leftOn: { type: Date, default: null },
      creator: { type: Boolean, default: false },
      admin: { type: Boolean, default: false },
      options: {
        favorite: { type: Boolean, default: false },
        blocked: { type: Boolean, default: false },
        muted: { type: Boolean, default: false }
      }
    }
  ], 
  lastMessage: { type: Schema.Types.ObjectId, ref: "Message", default: null, index: true },
  active: { type: Boolean, default: true },
  // This is for admin/creator of the group/chat conversation
  deleted: { type: Boolean, default: false },
  deletedOn: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  isImported: { type: Boolean, default: false },
  importedOn: { type: Date, default: null },
  summary: { type: String, default: null },
  originalIds: [{type: Number}],
  publicKey: { type: String }
});

// ChatSchema.pre("save", function (next) {
//   // notify(this.get('email')); 
//   next();
// });

mongoose.model("Chat", ChatSchema);
