const mongoose = require('mongoose');
const config = require('../../utils/config')

class Database {
    constructor() { }
    
    async connect() {
        const url = config.MONGODB.HOST; 

        try {
            await mongoose.connect(url);
            console.log('✓ Connected to MongoDB');
        } catch (error) {
            console.error(`✗ Error connecting to MongoDB: ${error.message}`);
            throw error;
        }
    }
    
    async disconnect() {
        try {
            await mongoose.connection.close();
            console.log('✓ MongoDB disconnected');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error.message);
        }
    }
}

module.exports = Database;