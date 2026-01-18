const mongoose = require('mongoose');  
const UserModel = mongoose.model('User');  

const _ = require('lodash');
const { isBuffer } = require('lodash');

class ContactService {
    constructor(userModel) { 
        this.model = userModel
    }

    /**
     * Store my winkyer for a user
     *
     * @param {*} contacts
     * @param {*} userId
     * @return {*} 
     * @memberof UserService
     */
    async storeContacts(contacts, userId) {
        return new Promise((resolve, reject) => {
            try { 
                const date = Date.now();
                let contactList = [];
                contacts.forEach((contact, index, array) => {
                    let cnt = { 
                        id: contact._id,
                        name: contact.changedName
                    } 
    
                    contactList.push(cnt);
                });
    
                const update = { $set: { 'contacts': contactList, updatedOn: date } };
    
                this.model.findById(userId)
                .then((user) => {  
                    if (user) {   
                        user.updatedOn = date;
                        let save = false;

                        contacts.forEach((contact, index, array) => {
                            const exists = user.contacts.find(u => u.id === contact._id);
                            if (exists) {  
                                const index = user.contacts.findIndex(member => member.id == contact._id); 
                                if (contact.changedName != "" && exists.name != contact.changedName) {
                                    // user.contacts.push({ 
                                    //     id: contact._id,
                                    //     name: contact.changedName
                                    // });
                                    user.contacts[index].name = contact.changedName;
                                    save = true;
                                } 
                            } else {
                                user.contacts.push({ 
                                    id: contact._id,
                                    name: contact.changedName || null
                                })
                                save = true;
                            } 
                        });

                        if (save) {
                            user.save((err) => {
                                if (err) return reject(err);
    
                                resolve(user);
                            });
                        } 
                    } else {
                        reject(new Error('No user found'));
                    }
                }).catch(err => { 
                    reject(err); 
                });
            } catch (ex) {
                console.error('Generic Error storing contacts: ' + ex.message)
                reject(ex); 
            } 
        });
    }

    /**
     * Remove winkyer from my list
     *
     * @param {*} contact
     * @param {*} from
     * @return {*} 
     * @memberof ContactService
     */
    async remove(contact, from) {
        return new Promise((resolve, reject) => {
            try { 
                const date = Date.now();
                // const filter = { _id: from, 'contacts.id': { "$in": [contact._id] } };  
                // const update = { $set: { 'contacts.$.removedOn': date } };
                this.model.findById(from)
                .then((user) => {  
                    if (user) {
                        const index = user.contacts.findIndex(member => member.id == contact._id); 
                        if (index === -1) return reject('No user found');

                        user.contacts[index].removedOn = date;
                        user.contacts[index].editedOn = date;
                        user.save((err) => {
                            if (err) return reject(err);

                            console.log('zootvcher updated')
                            resolve(user);
                        });
                    } else {
                        let err = new Error('No winkyer found for criteria');
                        console.error(err.message)
                        reject(err);
                    }
                }).catch(err => { 
                    console.error(err.message)
                    reject(err); 
                });
            } catch (ex) {
                console.error('Generic Error removing winkyer: ' + ex.message)
                reject(ex); 
            } 
        })
    }

    /**
     * Edit zottcher name
     *
     * @param {*} contact
     * @param {*} from
     * @return {*} 
     * @memberof ContactService
     */
    async edit(contact, from) {
        return new Promise((resolve, reject) => {
            try { 
                const date = Date.now();
                // const filter = { _id: from, 'contacts.id': { "$in": [contact._id] } };  
                // const update = { $set: { 'contacts.$.removedOn': date } };
                this.model.findById(from)
                .then((user) => {  
                    if (user) {
                        const index = user.contacts.findIndex(member => member.id == contact._id); 
                        if (index === -1) return reject('No user found');

                        user.contacts[index].name = contact.changedName;
                        user.contacts[index].editedOn = date;
                        user.save((err) => {
                            if (err) return reject(err);

                            console.log('winkyer updated')
                            resolve(user);
                        });
                    } else {
                        let err = new Error('No winkyer found for criteria');
                        console.error(err.message)
                        reject(err);
                    }
                }).catch(err => { 
                    console.error(err.message)
                    reject(err); 
                });
            } catch (ex) {
                console.error('Generic Error removing winkyer: ' + ex.message)
                reject(ex); 
            } 
        })
    }
}

module.exports = ContactService;