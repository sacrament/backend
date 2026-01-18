 
const config = require('../../../utils/config');
const request = require('request');

class APIGateway {
    constructor() { }

    async blockUser(userId, token) {
        return blockUser(userId, token)
    }

    async unblockUser(userId, token) {
        return unblockUser(userId, token)
    } 
}

/**
 *
 *
 * @param {*} userId
 * @param {*} token
 * @returns
 */
const blockUser = (userId, token) => {
    console.log(`Blocking user: ${userId}`);
    return new Promise((resolve, reject) => {
        try {
            const options = {
                method: 'POST',
                url: config.AWS.API_ENDPOINT + 'users/blocks',
                headers: {
                    'content-type': 'application/json', 
                    'Authorization': 'Bearer ' + token
                },
                json: { 'userId': userId, "reason": "NO_REASON", "description": "Annoying" }
                
            }; 
            request(options, (error, res, body) => {
                if (error) {
                    console.log(`Error ocurred while blocking user at API Endpoint: ${error.message}`);

                    return reject(error);
                }

                console.log(`Response from API block user`);

                if (res.statusCode == 204) {
                    // console.log(body);
                    resolve(true);
                }
            })
        } catch (ex) {
            console.error(`Error occurred while making API call: ${ex.message}`)
            reject(ex.message);
        }
    });
}

/**
 *
 *
 * @param {*} userId
 * @param {*} token
 * @returns
 */
const unblockUser = (userId, token) => {
    console.log(`Unblcoking user: ${userId}`);
    return new Promise((resolve, reject) => {
        try {
            const options = {
                method: 'DELETE',
                url: config.AWS.API_ENDPOINT + `users/blocks/${userId}`,
                headers: {
                    'content-type': 'application/json', 
                    'Authorization': 'Bearer ' + token
                }
            }; 
            request(options, (error, res, body) => {
                if (error) {
                    console.log(`Error ocurred while blocking user at API Endpoint: ${error.message}`);

                    return reject(error);
                }

                console.log(`Response from API unblcok user`);

                if (res.statusCode == 204) {
                    // console.log(body);
                    resolve(true);
                } else {
                    resolve(false)
                }
            })
        } catch (ex) {
            console.error(`Error occurred while making API call: ${ex.message}`)
            reject(ex.message);
        }
    });
}

module.exports = APIGateway;