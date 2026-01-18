# 📋 Configuration Module

This folder contains all application configuration files, organized by purpose.

## Structure

```
config/
├── index.js              # Configuration hub (main export)
│
├── database/             # 🗄️ Database connections
│   ├── index.js          # Exports both databases
│   ├── mongodb.js        # MongoDB connection (Mongoose)
│   └── mysql.js          # MySQL connection (Sequelize)
│
└── integrations/         # 🔌 External integrations
    └── socket.js         # Socket.IO config (backward compatibility)
```

## Usage

### Database Configuration

```javascript
// Import database connections
const { MongoDatabase, MySQLDatabase } = require('./config/database');

// Or import specific database
const { MongoDatabase } = require('./config/database');

// Use in application
const db = new MongoDatabase();
await db.connect();
```

### Socket.IO Configuration

Socket.IO configuration has been moved to `server/socket/index.js` for better organization.

If you need it from config folder (backward compatibility):
```javascript
const socketConfig = require('./config/integrations/socket');
```

## Database Configurations

### MongoDB (`database/mongodb.js`)

- **ORM:** Mongoose v7.5.0
- **Connection:** Uses `MONGODB.HOST` from environment variables
- **Features:** Connection pooling, automatic reconnection

**Methods:**
- `connect()` - Connect to MongoDB
- `disconnect()` - Close connection

### MySQL (`database/mysql.js`)

- **ORM:** Sequelize v6.33.0
- **Connection:** Uses `MYSQL.HOST`, `MYSQL.NAME`, `MYSQL.USERNAME`, `MYSQL.PASSWORD`
- **Features:** Connection pooling, automatic migration

**Setup:**
- Authenticates connection on load
- Runs migrations automatically
- Loads MySQL models

## Environment Variables

Required variables in `.env`:

```
# MongoDB
MONGODB_HOST=mongodb://localhost:27017/winky

# MySQL
MYSQL_HOST=localhost
MYSQL_NAME=winky_db
MYSQL_USERNAME=root
MYSQL_PASSWORD=password
```

## Adding New Configurations

1. **Create new folder** in config/:
   ```
   config/newservice/
   ├── index.js
   └── config.js
   ```

2. **Export from index.js:**
   ```javascript
   module.exports = require('./config');
   ```

3. **Add to config/index.js**:
   ```javascript
   const newService = require('./newservice');
   
   module.exports = {
     database: { /* ... */ },
     newService,
   };
   ```

## Best Practices

- ✅ Keep config files focused on one purpose
- ✅ Use environment variables for secrets
- ✅ Export clean, reusable interfaces
- ✅ Add JSDoc comments
- ✅ Handle connection errors gracefully

## See Also

- [Environment Variables](../.env.example)
- [Database Models](../models/)
- [Services](../services/)
