const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const isDev = process.env.ENV_NAME !== 'production';

const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack }) =>
        stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
    )
);

const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: isDev ? 'debug' : 'http',
    format: isDev ? devFormat : prodFormat,
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// Morgan-compatible stream — parses structured JSON emitted by the custom morgan format
logger.stream = {
    write: (message) => {
        try {
            const data = JSON.parse(message.trimEnd());
            logger.http(`${data.method} ${data.path} ${data.status} ${data.responseTime}`, data);
        } catch {
            logger.http(message.trimEnd());
        }
    },
};

module.exports = logger;
