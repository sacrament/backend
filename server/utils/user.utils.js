const mongoose = require('mongoose');
const UserModel = mongoose.model('User');

/**
 * User utility functions for common user-related operations
 * @module utils/user.utils
 */

/**
 * Normalize user ID from integer to MongoDB ObjectId string
 * Handles both integer IDs and ObjectId strings
 *
 * @param {number|string} userId - User ID (integer or ObjectId string)
 * @returns {Promise<string>} MongoDB ObjectId as string
 * @throws {Error} If user not found or invalid ID
 *
 * @example
 * const mongoId = await normalizeUserId(12345);
 * // Returns: "507f1f77bcf86cd799439011"
 *
 * const mongoId = await normalizeUserId("507f1f77bcf86cd799439011");
 * // Returns: "507f1f77bcf86cd799439011"
 */
async function normalizeUserId(userId) {
    if (!userId) {
        throw new Error('User ID is required');
    }

    // If already a MongoDB ObjectId string, return as-is
    if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        return userId;
    }

    // If it's a number (integer ID), convert to MongoDB ObjectId
    if (typeof userId === 'number') {
        const user = await UserModel.findOne({ id: userId }).select('_id');
        if (!user) {
            throw new Error(`User not found with id: ${userId}`);
        }
        return user._id.toString();
    }

    throw new Error(`Invalid user ID format: ${userId}`);
}

/**
 * Normalize multiple user IDs from integers to MongoDB ObjectId strings
 *
 * @param {Array<number|string>} userIds - Array of user IDs
 * @returns {Promise<Array<string>>} Array of MongoDB ObjectId strings
 * @throws {Error} If userIds is not an array
 *
 * @example
 * const mongoIds = await normalizeUserIds([123, 456, "507f1f77bcf86cd799439011"]);
 * // Returns: ["507f...", "507f...", "507f..."]
 */
async function normalizeUserIds(userIds) {
    if (!Array.isArray(userIds)) {
        throw new Error('User IDs must be an array');
    }

    if (userIds.length === 0) {
        return [];
    }

    // Separate integer IDs and ObjectId strings
    const integerIds = userIds.filter(id => typeof id === 'number');
    const objectIdStrings = userIds.filter(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));

    // If we only have ObjectId strings, return them
    if (integerIds.length === 0) {
        return objectIdStrings;
    }

    // Convert integer IDs to MongoDB ObjectIds
    const users = await UserModel.find({ id: { $in: integerIds } }).select('_id id');
    const convertedIds = users.map(user => user._id.toString());

    // Combine converted IDs with existing ObjectId strings
    return [...convertedIds, ...objectIdStrings];
}

/**
 * Get user by integer ID with selected fields
 *
 * @param {number} userId - User integer ID
 * @param {string|Object} [select] - Fields to select (optional)
 * @returns {Promise<Object>} User object
 * @throws {Error} If user not found
 *
 * @example
 * const user = await getUserByIntId(123);
 * const user = await getUserByIntId(123, '_id id name email');
 * const user = await getUserByIntId(123, { _id: 1, id: 1, name: 1 });
 */
async function getUserByIntId(userId, select = null) {
    if (typeof userId !== 'number') {
        throw new Error('User ID must be a number');
    }

    const query = UserModel.findOne({ id: userId });

    if (select) {
        query.select(select);
    }

    const user = await query;

    if (!user) {
        throw new Error(`User not found with id: ${userId}`);
    }

    return user;
}

/**
 * Validate if a value is a valid MongoDB ObjectId
 *
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid ObjectId
 *
 * @example
 * isValidObjectId("507f1f77bcf86cd799439011"); // true
 * isValidObjectId("invalid"); // false
 * isValidObjectId(123); // false
 */
function isValidObjectId(value) {
    return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

/**
 * Validate if a value is a valid user ID (integer or ObjectId)
 *
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid user ID
 *
 * @example
 * isValidUserId(123); // true
 * isValidUserId("507f1f77bcf86cd799439011"); // true
 * isValidUserId("invalid"); // false
 */
function isValidUserId(value) {
    return typeof value === 'number' || isValidObjectId(value);
}

/**
 * Get users by their MongoDB ObjectIds
 *
 * @param {Array<string>} userIds - Array of MongoDB ObjectId strings
 * @param {string|Object} [select] - Fields to select (optional)
 * @returns {Promise<Array<Object>>} Array of user objects
 * @throws {Error} If userIds is not an array
 *
 * @example
 * const users = await getUsersByIds(["507f...", "507f..."]);
 * const users = await getUsersByIds(["507f..."], '_id id name email');
 */
async function getUsersByIds(userIds, select = null) {
    if (!Array.isArray(userIds)) {
        throw new Error('User IDs must be an array');
    }

    if (userIds.length === 0) {
        return [];
    }

    const query = UserModel.find({ _id: { $in: userIds } });

    if (select) {
        query.select(select);
    }

    return await query.lean();
}

module.exports = {
    normalizeUserId,
    normalizeUserIds,
    getUserByIntId,
    getUsersByIds,
    isValidObjectId,
    isValidUserId
};
