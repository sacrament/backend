const mongoose = require('mongoose');
const UserModel = mongoose.model('User');
const { validateRequired, validateObjectId, validateArray, validateString } = require('../../../utils/validation.utils');

/**
 * Contact Service for managing user contacts
 * Handles storing, editing, and removing contacts from user profiles
 */
class ContactService {
    constructor(userModel) {
        this.model = userModel;
    }

    /**
     * Store/update contacts for a user
     * Updates existing contacts with new names or adds new contacts
     *
     * @param {Array<Object>} contacts - Array of contact objects
     * @param {string} contacts[]._id - Contact user ID
     * @param {string} contacts[].changedName - New/updated contact name
     * @param {string} userId - User ID to store contacts for
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user not found or validation fails
     *
     * @example
     * await contactService.storeContacts([
     *   { _id: "507f...", changedName: "John Doe" },
     *   { _id: "507f...", changedName: "Jane Smith" }
     * ], "507f...");
     */
    async storeContacts(contacts, userId) {
        validateRequired(userId, 'User ID');
        validateObjectId(userId, 'User ID');
        validateArray(contacts, 'Contacts', 1);

        const user = await this.model.findById(userId);

        if (!user) {
            throw new Error('User not found');
        }

        const date = Date.now();
        user.updatedOn = date;

        let hasChanges = false;

        for (const contact of contacts) {
            validateRequired(contact._id, 'Contact ID');

            const existingContact = user.contacts.find(u => u.id === contact._id);

            if (existingContact) {
                // Update existing contact if name changed
                const contactIndex = user.contacts.findIndex(member => member.id === contact._id);

                if (contact.changedName && contact.changedName !== '' && existingContact.name !== contact.changedName) {
                    user.contacts[contactIndex].name = contact.changedName;
                    user.contacts[contactIndex].editedOn = date;
                    hasChanges = true;
                }
            } else {
                // Add new contact
                user.contacts.push({
                    id: contact._id,
                    name: contact.changedName || null,
                    editedOn: date
                });
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await user.save();
            console.log(`Contacts updated for user: ${userId}`);
        }

        return user;
    }

    /**
     * Remove a contact from user's contact list
     * Marks contact as removed by setting removedOn timestamp
     *
     * @param {Object} contact - Contact to remove
     * @param {string} contact._id - Contact user ID
     * @param {string} from - User ID removing the contact
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user or contact not found
     *
     * @example
     * await contactService.remove({ _id: "507f..." }, "507f...");
     */
    async remove(contact, from) {
        validateRequired(from, 'User ID');
        validateObjectId(from, 'User ID');
        validateRequired(contact, 'Contact');
        validateRequired(contact._id, 'Contact ID');

        const user = await this.model.findById(from);

        if (!user) {
            throw new Error('User not found');
        }

        const contactIndex = user.contacts.findIndex(member => member.id === contact._id);

        if (contactIndex === -1) {
            throw new Error('Contact not found in user\'s contact list');
        }

        const date = Date.now();
        user.contacts[contactIndex].removedOn = date;
        user.contacts[contactIndex].editedOn = date;

        await user.save();

        console.log(`Contact removed for user: ${from}`);

        return user;
    }

    /**
     * Edit contact name in user's contact list
     *
     * @param {Object} contact - Contact to edit
     * @param {string} contact._id - Contact user ID
     * @param {string} contact.changedName - New contact name
     * @param {string} from - User ID editing the contact
     * @returns {Promise<Object>} Updated user object
     * @throws {Error} If user or contact not found
     *
     * @example
     * await contactService.edit(
     *   { _id: "507f...", changedName: "New Name" },
     *   "507f..."
     * );
     */
    async edit(contact, from) {
        validateRequired(from, 'User ID');
        validateObjectId(from, 'User ID');
        validateRequired(contact, 'Contact');
        validateRequired(contact._id, 'Contact ID');
        validateString(contact.changedName, 'Contact name');

        const user = await this.model.findById(from);

        if (!user) {
            throw new Error('User not found');
        }

        const contactIndex = user.contacts.findIndex(member => member.id === contact._id);

        if (contactIndex === -1) {
            throw new Error('Contact not found in user\'s contact list');
        }

        const date = Date.now();
        user.contacts[contactIndex].name = contact.changedName;
        user.contacts[contactIndex].editedOn = date;

        await user.save();

        console.log(`Contact name updated for user: ${from}`);

        return user;
    }

    /**
     * Get all contacts for a user
     *
     * @param {string} userId - User ID
     * @returns {Promise<Array<Object>>} Array of user contacts
     * @throws {Error} If user not found
     */
    async getContacts(userId) {
        validateRequired(userId, 'User ID');
        validateObjectId(userId, 'User ID');

        const user = await this.model.findById(userId).select('contacts');

        if (!user) {
            throw new Error('User not found');
        }

        return user.contacts || [];
    }

    /**
     * Get active (non-removed) contacts for a user
     *
     * @param {string} userId - User ID
     * @returns {Promise<Array<Object>>} Array of active contacts
     * @throws {Error} If user not found
     */
    async getActiveContacts(userId) {
        validateRequired(userId, 'User ID');
        validateObjectId(userId, 'User ID');

        const user = await this.model.findById(userId).select('contacts');

        if (!user) {
            throw new Error('User not found');
        }

        // Filter out removed contacts
        return (user.contacts || []).filter(contact => !contact.removedOn);
    }

    /**
     * Check if a user has a specific contact
     *
     * @param {string} userId - User ID
     * @param {string} contactId - Contact user ID to check
     * @returns {Promise<boolean>} True if contact exists and is not removed
     * @throws {Error} If user not found
     */
    async hasContact(userId, contactId) {
        validateRequired(userId, 'User ID');
        validateObjectId(userId, 'User ID');
        validateRequired(contactId, 'Contact ID');

        const user = await this.model.findById(userId).select('contacts');

        if (!user) {
            throw new Error('User not found');
        }

        const contact = user.contacts.find(c => c.id === contactId && !c.removedOn);
        return !!contact;
    }
}

module.exports = ContactService;
