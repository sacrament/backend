const jwt = require('jsonwebtoken');
const config = require('../utils/config');

module.exports = {
    verifyToken: async (request, response, next) => { 
        let token = request.headers.authorization;

        if (token) { 
            if (token.startsWith('Bearer ')) {
                // Remove Bearer from string
                token = token.slice(7, token.length);
            }
            
            jwt.verify(token, config.APP_SECRET, async (err, decoded) => {      
                if (err) {
                    console.error('Error verifiying token: ' + err)
                    if (err.message.indexOf('expired') > -1) {
                        console.error('Token has expired')
                        return response.status(400).json({ status: 'false', message: 'Token has expired' }); 
                    } else {
                        console.error('Token issue: ' + err.message)
                        return response.status(400).json({ status: 'error', message: err.message });
                    }
                } else {
                    request.authToken = token;
                    request.decodedToken = decoded;    
                    next();
                }
            });
        } else {
            return response.status(401).json({ 
                status: 'error', 
                message: 'Authorization token not provided' 
            });
        }
    },
    newToken: async (user) => {
        return jwt.sign(user, config.APP_SECRET, { expiresIn: '30d' });
    },
    newRefreshToken: async (user) => {
        return jwt.sign(user, config.APP_SECRET_REFRESH, { expiresIn: '365d' });
    }
}