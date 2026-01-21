const mongoose = require('mongoose');

/**
 * Validation utility functions for input validation
 * @module utils/validation.utils
 */

/**
 * Validate if a value is a non-empty string
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not a non-empty string
 *
 * @example
 * validateString("hello", "username"); // passes
 * validateString("", "username"); // throws Error
 * validateString(123, "username"); // throws Error
 */
function validateString(value, fieldName = 'Value') {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

/**
 * Validate if a value is a number
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not a number
 *
 * @example
 * validateNumber(123, "age"); // passes
 * validateNumber("123", "age"); // throws Error
 */
function validateNumber(value, fieldName = 'Value') {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`${fieldName} must be a valid number`);
    }
}

/**
 * Validate if a value is a boolean
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not a boolean
 *
 * @example
 * validateBoolean(true, "isActive"); // passes
 * validateBoolean("true", "isActive"); // throws Error
 */
function validateBoolean(value, fieldName = 'Value') {
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean`);
    }
}

/**
 * Validate if a value is an array
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @param {number} [minLength=0] - Minimum array length (optional)
 * @throws {Error} If value is not an array or doesn't meet length requirement
 *
 * @example
 * validateArray([1, 2, 3], "items"); // passes
 * validateArray([1, 2], "items", 3); // throws Error (too short)
 * validateArray("not array", "items"); // throws Error
 */
function validateArray(value, fieldName = 'Value', minLength = 0) {
    if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array`);
    }
    if (value.length < minLength) {
        throw new Error(`${fieldName} must contain at least ${minLength} item(s)`);
    }
}

/**
 * Validate if a value is a plain object
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not a plain object
 *
 * @example
 * validateObject({name: "John"}, "user"); // passes
 * validateObject(null, "user"); // throws Error
 * validateObject([1, 2], "user"); // throws Error
 */
function validateObject(value, fieldName = 'Value') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be a valid object`);
    }
}

/**
 * Validate if a value is a valid MongoDB ObjectId
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='ObjectId'] - Name of field for error message
 * @throws {Error} If value is not a valid ObjectId
 *
 * @example
 * validateObjectId("507f1f77bcf86cd799439011", "userId"); // passes
 * validateObjectId("invalid", "userId"); // throws Error
 */
function validateObjectId(value, fieldName = 'ObjectId') {
    if (!value || typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
    }
}

/**
 * Validate if a value is required (not null, undefined, or empty string)
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is null, undefined, or empty string
 *
 * @example
 * validateRequired("hello", "username"); // passes
 * validateRequired(0, "count"); // passes (0 is valid)
 * validateRequired(null, "username"); // throws Error
 * validateRequired("", "username"); // throws Error
 */
function validateRequired(value, fieldName = 'Value') {
    if (value === null || value === undefined || value === '') {
        throw new Error(`${fieldName} is required`);
    }
}

/**
 * Validate if a value exists in an allowed list
 *
 * @param {*} value - Value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not in the allowed list
 *
 * @example
 * validateEnum("active", ["active", "inactive"], "status"); // passes
 * validateEnum("deleted", ["active", "inactive"], "status"); // throws Error
 */
function validateEnum(value, allowedValues, fieldName = 'Value') {
    if (!Array.isArray(allowedValues)) {
        throw new Error('Allowed values must be an array');
    }
    if (!allowedValues.includes(value)) {
        throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
}

/**
 * Validate if a string matches a pattern (regex)
 *
 * @param {string} value - Value to validate
 * @param {RegExp} pattern - Regular expression pattern
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @param {string} [errorMessage] - Custom error message
 * @throws {Error} If value doesn't match pattern
 *
 * @example
 * validatePattern("test@example.com", /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email");
 * validatePattern("123", /^\d+$/, "code"); // passes
 */
function validatePattern(value, pattern, fieldName = 'Value', errorMessage = null) {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }
    if (!pattern.test(value)) {
        throw new Error(errorMessage || `${fieldName} format is invalid`);
    }
}

/**
 * Validate if a number is within a range
 *
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {string} [fieldName='Value'] - Name of field for error message
 * @throws {Error} If value is not within range
 *
 * @example
 * validateRange(5, 1, 10, "rating"); // passes
 * validateRange(11, 1, 10, "rating"); // throws Error
 */
function validateRange(value, min, max, fieldName = 'Value') {
    validateNumber(value, fieldName);
    if (value < min || value > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
}

/**
 * Validate if a value is a valid date
 *
 * @param {*} value - Value to validate
 * @param {string} [fieldName='Date'] - Name of field for error message
 * @throws {Error} If value is not a valid date
 *
 * @example
 * validateDate(new Date(), "createdAt"); // passes
 * validateDate("2024-01-01", "createdAt"); // throws Error (string, not Date)
 * validateDate(Date.now(), "createdAt"); // passes (timestamp)
 */
function validateDate(value, fieldName = 'Date') {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
        throw new Error(`${fieldName} must be a valid date`);
    }
}

/**
 * Validate multiple fields at once with custom validators
 *
 * @param {Object} data - Object containing data to validate
 * @param {Object} rules - Validation rules object
 * @throws {Error} If any validation fails
 *
 * @example
 * validateFields(
 *   { name: "John", age: 25, email: "john@example.com" },
 *   {
 *     name: { type: 'string', required: true },
 *     age: { type: 'number', min: 0, max: 120 },
 *     email: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
 *   }
 * );
 */
function validateFields(data, rules) {
    if (!data || typeof data !== 'object') {
        throw new Error('Data must be an object');
    }

    for (const [fieldName, rule] of Object.entries(rules)) {
        const value = data[fieldName];

        // Check required
        if (rule.required && (value === null || value === undefined || value === '')) {
            throw new Error(`${fieldName} is required`);
        }

        // Skip further validation if not required and value is empty
        if (!rule.required && (value === null || value === undefined || value === '')) {
            continue;
        }

        // Type validation
        if (rule.type === 'string') {
            validateString(value, fieldName);
        } else if (rule.type === 'number') {
            validateNumber(value, fieldName);
        } else if (rule.type === 'boolean') {
            validateBoolean(value, fieldName);
        } else if (rule.type === 'array') {
            validateArray(value, fieldName, rule.minLength);
        } else if (rule.type === 'object') {
            validateObject(value, fieldName);
        } else if (rule.type === 'objectId') {
            validateObjectId(value, fieldName);
        } else if (rule.type === 'date') {
            validateDate(value, fieldName);
        }

        // Additional validations
        if (rule.enum) {
            validateEnum(value, rule.enum, fieldName);
        }
        if (rule.pattern) {
            validatePattern(value, rule.pattern, fieldName, rule.patternError);
        }
        if (rule.min !== undefined || rule.max !== undefined) {
            const min = rule.min !== undefined ? rule.min : -Infinity;
            const max = rule.max !== undefined ? rule.max : Infinity;
            validateRange(value, min, max, fieldName);
        }
    }
}

module.exports = {
    validateString,
    validateNumber,
    validateBoolean,
    validateArray,
    validateObject,
    validateObjectId,
    validateRequired,
    validateEnum,
    validatePattern,
    validateRange,
    validateDate,
    validateFields
};
