
// const uuid = require('uuid/v1');
const { v1: uuidv1 } = require('uuid');

module.exports = {
    timeStampUTC: () => {
        return timeUTC();
    },
    dateUTCFromTimeStamp: (timeStamp) => {
        return dateFromTimeStamp(timeStamp);
    },
    uniqueId: () => {
        return uuidv1();
    },
    chatColumnsToShow: () => {
        return chatColumnsToShow
    },
    messageColumnsToShow: () => {
        return messageColumnsToShow
    },
    lastMessageColumnsToShow: () => {
        return lastMessageColumnsToShow
    },
    userColumnsToShow: () => {
        return userColumnsToShow
    },
    replyMessageColumnsToShow: () => {
        return replyMessageColumnsToShow
    },
    mediaColumnsToShow: () => {
        return mediaColumnsToShow
    },
    reactionColumnsToShow: () => {
        return reactionColumnsToShow
    },
}

const chatColumnsToShow = "_id id name members lastMessage type imageUrl createdOn deleted deletedOn";
const messageColumnsToShow = "_id id content status from chatId kind sentOn deleted reactions media replyTo sharedContact";
const userColumnsToShow = "_id id name email phone imageUrl device options";
const lastMessageColumnsToShow = "_id id content status reply from chatId kind sentOn deleted reactions media replyTo sharedContact";
const replyMessageColumnsToShow = "_id id content from chatId kind sentOn deleted reactions media sharedContact";

const mediaColumnsToShow = "_id type date name url editedOn thumbnail";
const reactionColumnsToShow = "_id date from kind editedOn chatId";

const timeUTC = () => {
    const date = new Date(); 
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const miliseconds = date.getUTCMilliseconds();
    const timeStamp = Date.UTC(year, month, day, hour, minutes, seconds, miliseconds);   

    return timeStamp
}

const dateFromTimeStamp = (timeStamp) => {
    const date = new Date(timeStamp * 1000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const miliseconds = date.getUTCMilliseconds();
    const utcDate = Date.UTC(year, month, day, hour, minutes, seconds, miliseconds);

    return utcDate;
} 