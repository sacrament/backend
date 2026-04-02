if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env.development' });
}
require('dotenv').config({ path: '.env.local' });

module.exports = {
    ENV_NAME: process.env.ENV_NAME,
    LOCAL: process.env.LOCAL === 'true',
    PORT: parseInt(process.env.PORT) || 3000,
    HEARTBEAT_TIMEOUT: parseInt(process.env.HEARTBEAT_TIMEOUT),
    HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL),
    UPGRADE: parseInt(process.env.UPGRADE_TIMEOUT),
    REGION: process.env.AWS_REGION,
    URL: process.env.URL || `http://localhost:${process.env.PORT || 3000}`,
    
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: parseInt(process.env.REDIS_PORT),
    
    SECRET: process.env.SECRET,
    APP_SECRET: process.env.APP_SECRET,
    APP_SECRET_REFRESH: process.env.APP_SECRET_REFRESH,
    CLIENT_JWT_BASE_SECRET: process.env.CLIENT_JWT_BASE_SECRET,
    
    MONGODB: {
        HOST: process.env.MONGO_HOST,
        PORT: parseInt(process.env.MONGO_PORT),
        NAME: process.env.MONGO_DB_NAME,
    },
    
    MYSQL: {
        admin: {
            USERNAME: process.env.MYSQL_ADMIN_USERNAME,
            PASSWORD: process.env.MYSQL_ADMIN_PASSWORD
        }
    },
    
    IOS_BUNDLE: process.env.IOS_BUNDLE,
    IOS_KEY_TOKEN: process.env.IOS_KEY_TOKEN,
    IOS_TEAM_ID: process.env.IOS_TEAM_ID,
    
    GCM_SERVER_ID: process.env.GCM_SERVER_ID,
    
    TWILIO: {
        ACCOUNTSID: process.env.TWILIO_ACCOUNT_SID,
        AUTHTOKEN: process.env.TWILIO_AUTH_TOKEN,
        API_KEY: process.env.TWILIO_API_KEY,
        API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET,
        IOS_PUSH_CREDENTIAL_SID: process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID,
        ANDROID_PUSH_CREDENTIAL_SID: process.env.TWILIO_ANDROID_PUSH_CREDENTIAL_SID,
        APP_SID: process.env.TWILIO_APP_SID,
        NOTIFICATION_SERVICE_SID: process.env.TWILIO_NOTIFICATION_SERVICE_SID
    },
    
    AWS: {
        BUCKET_NAME: process.env.AWS_BUCKET_NAME,
        ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        API_ENDPOINT: process.env.AWS_API_ENDPOINT,
        REGION: process.env.AWS_REGION
    }
};
