const mongoose = require('mongoose');

class Database {
    #maxRetries = 5;
    #retryDelay = 5000; // 5 seconds
    #currentRetry = 0;
    #isShuttingDown = false;

    async connect() {
        return this.#connectWithRetry();
    }

    async #connectWithRetry() {
        try {
            const url = process.env.MONGO_HOST;

            await mongoose.connect(url, {
                retryWrites: true,
                w: 'majority',
                serverSelectionTimeoutMS: 10000,
            });

            console.log('✓ Connected to MongoDB');
            this.#currentRetry = 0;

            // Setup event listeners for connection management
            this.#setupConnectionListeners();

            return true;
        } catch (error) {
            if (this.#isShuttingDown) {
                console.log('Shutdown in progress, skipping retry');
                throw error;
            }

            this.#currentRetry++;

            if (this.#currentRetry >= this.#maxRetries) {
                console.error(`✗ Failed to connect to MongoDB after ${this.#maxRetries} attempts: ${error.message}`);
                throw error;
            }

            const delay = this.#retryDelay * this.#currentRetry;
            console.warn(`✗ MongoDB connection failed (attempt ${this.#currentRetry}/${this.#maxRetries}). Retrying in ${delay}ms...`);
            console.warn(`  Error: ${error.message}`);

            await this.#sleep(delay);
            return this.#connectWithRetry();
        }
    }

    #setupConnectionListeners() {
        mongoose.connection.on('disconnected', () => {
            if (!this.#isShuttingDown) {
                console.warn('⚠ MongoDB disconnected. Attempting to reconnect...');
                this.#attemptReconnect();
            }
        });

        mongoose.connection.on('error', (error) => {
            if (!this.#isShuttingDown) {
                console.error(`✗ MongoDB connection error: ${error.message}`);
            }
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✓ MongoDB reconnected successfully');
            this.#currentRetry = 0;
        });

        mongoose.connection.on('close', () => {
            console.log('✓ MongoDB connection closed');
        });
    }

    async #attemptReconnect() {
        if (this.#currentRetry >= this.#maxRetries || this.#isShuttingDown) {
            return;
        }

        this.#currentRetry++;
        const delay = this.#retryDelay * this.#currentRetry;

        console.log(`Reconnection attempt ${this.#currentRetry}/${this.#maxRetries} in ${delay}ms...`);

        await this.#sleep(delay);

        try {
            const url = process.env.MONGO_HOST;
            await mongoose.connect(url, {
                retryWrites: true,
                w: 'majority',
                serverSelectionTimeoutMS: 10000,
            });
            console.log('✓ Reconnected to MongoDB');
            this.#currentRetry = 0;
        } catch (error) {
            console.error(`✗ Reconnection failed: ${error.message}`);

            if (this.#currentRetry < this.#maxRetries && !this.#isShuttingDown) {
                this.#attemptReconnect();
            }
        }
    }

    async disconnect() {
        try {
            this.#isShuttingDown = true;
            await mongoose.connection.close();
            console.log('✓ MongoDB disconnected gracefully');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error.message);
            throw error;
        }
    }

    #sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Database;
