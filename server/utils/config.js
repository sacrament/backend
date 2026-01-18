// Load environment variables with fallbacks for development
require('dotenv').config();

module.exports = {
    ENV_NAME: process.env.ENV_NAME || 'production',
    LOCAL: process.env.LOCAL === 'true' || process.env.ENV_NAME === 'development',
    PORT: process.env.PORT || 3000,
    HEARTBEAT_TIMEOUT: 40000,
    HEARTBEAT_INTERVAL: 27000,
    UPGRADE: 30000,
    REGION: process.env.AWS_REGION || 'us-east-1',
    
    REDIS_HOST: process.env.REDIS_HOST || (process.env.ENV_NAME === 'development' 
        ? 'localhost' 
        : 'cha-re-bkzcc73ff5ak.j6vato.0001.use1.cache.amazonaws.com'),
    REDIS_PORT: process.env.REDIS_PORT || 6379, 
    
    SECRET: 'Winky2019Chat',
    APP_SECRET: process.env.APP_SECRET || 'mk6w5e5*TQT0',
    APP_SECRET_REFRESH: process.env.APP_SECRET_REFRESH || '83ZucT1@&39@',
    
    MONGODB: {
        HOST: process.env.MONGO_HOST || 'mongodb+srv://winky_ca_2022:Izkxsj40Ygqp2aay@cluster0.artad.mongodb.net/?retryWrites=true&w=majority',
        PORT: process.env.MONGO_PORT || 27017,
        NAME: 'winky',
    },
    
    MYSQL: {
        admin: {
            USERNAME: process.env.MYSQL_ADMIN_USERNAME || 'admin',
            PASSWORD: process.env.MYSQL_ADMIN_PASSWORD || 'Admin2022Winky'
        }
    },
    
    IOS_BUNDLE: process.env.IOS_BUNDLE || 'com.app.winky',
    IOS_KEY_TOKEN: process.env.IOS_KEY_TOKEN || '2XCWJRBL6T',
    IOS_TEAM_ID: process.env.IOS_TEAM_ID || 'EKH9RC2775',
    
    GCM_SERVER_ID: process.env.GCM_SERVER_ID || 'AAAA7AEKv3Y:APA91bEY2UbO8roUyGq1Q8LbQ6yvMneXW_E3X472kMh3fZsmGFbLD6Wf7FQrMAXYIIEPzZVJlH9Y4-DCUA6UUL6iQLsiYi2Dq0DCTsTfW_SayesjuNkzGAx8VAFsFrjlaYFQMpJNYjmE',
    
    TWILIO: {
        ACCOUNTSID: process.env.TWILIO_ACCOUNT_SID || 'REDACTED',
        AUTHTOKEN: process.env.TWILIO_AUTH_TOKEN || 'REDACTED',
        API_KEY: process.env.TWILIO_API_KEY || 'REDACTED',
        API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET || 'REDACTED',
        IOS_PUSH_CREDENTIAL_SID: process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID || 'REDACTED',
        ANDROID_PUSH_CREDENTIAL_SID: process.env.TWILIO_ANDROID_PUSH_CREDENTIAL_SID || 'REDACTED',
        APP_SID: process.env.TWILIO_APP_SID || 'REDACTED',
        NOTIFICATION_SERVICE_SID: process.env.TWILIO_NOTIFICATION_SERVICE_SID || 'REDACTED'
    },
    
    AWS: {
        BUCKET_NAME: process.env.AWS_BUCKET_NAME || 'winky-chat',
        ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || 'REDACTED',
        SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || 'REDACTED',
        API_ENDPOINT: process.env.AWS_API_ENDPOINT || 'https://winky.com/',
        REGION: process.env.AWS_REGION || 'us-east-1'
    }
};

module.exports.URL = process.env.URL || 'http://localhost:' + module.exports.PORT;
