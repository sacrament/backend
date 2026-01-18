const express = require('express');
const router = express.Router(); 

const multer = require('multer');
const upload = multer();

const { 
    all,
    allFavorites,
    newChat,
    edit,
    deleteChat,
    chatById,
    addNewMembers,
    getUserIds,
    leaveChat,
    favoriteChat,
    blockChat,
    muteChat,
    getMessagesForChat,
    allChats,
    totalUnreadChatsForUser,
    uploadMedia,
    deleteMedia,
    messageById,
    messageReceivedAck, 
    messageSeenAck,
    sendMessage,
    conversationSeen
} = require('../controllers/chat.controller');

router.get('/', (req, res, next)  => {
    res.status(200).json({status: 'success', message: 'Chat Router'})
})

/// Create a new chat
router.post('/new', newChat);

/// Edit chat
router.patch('/edit/:id', edit);

/// Add new members to chat
router.patch('/members/add', addNewMembers);

/// Leave chat
/// Admin can not leave chat
router.patch('/leave/:id', leaveChat);

//Delete chat
router.delete('/delete/:id', deleteChat)

//Favorite chat
router.patch('/favorite/:id', favoriteChat)

//Mute chat
router.patch('/mute/:id', muteChat)

//Block chat
router.patch('/block/:id', blockChat)
 
/// ALl chats
router.get('/all', all);

/// ALl chats
router.get('/all/favorites', allFavorites);

/// Single chat 
router.get('/:id', chatById);

/// ALl chats
router.post('/users', getUserIds);

router.get('/:id/messages', getMessagesForChat)

/// ALl chats
router.get('/all/demo', allChats);

/// ALl chats
router.get('/all/unread', totalUnreadChatsForUser);

router.put('/upload/media', upload.single('chat-media'), uploadMedia);

router.delete('/media/:id', deleteMedia);

router.get('/message/:id', messageById);

router.post('/message/received', messageReceivedAck);

router.post('/message/seen', messageSeenAck);

router.post('/message/new', sendMessage);

router.post('/seen', conversationSeen);

/// Delete existing chat
// router.delete('/delete', deleteChat)
module.exports = router;