/**
 * Express Application Setup
 *
 * Configures middleware only. All routing is handled by api/routes/index.js.
 */

if (process.env.ENV_NAME !== 'production') {
    require('dotenv').config({ path: '.env.local' });
}

const express      = require('express');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path         = require('path');
const routes       = require('./api/routes/index');
const morgan       = require('morgan');
const logger       = require('./utils/logger');

const app = express();

// Trust proxy for accurate client IP (behind load balancer)
app.set('trust proxy', 1);

// ─── Request logging ──────────────────────────────────────────────────────────

const morganFormat = process.env.ENV_NAME === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, { stream: logger.stream }));

// ─── Security middleware ───────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Signature-Winky-Code', 'Client-Winky-KeyCode', 'X-Client-Token'],
}));

// Global API rate limit
app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: 'error', code: 429, message: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
}));

// ─── General middleware ────────────────────────────────────────────────────────

app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ key }) => console.warn(`Sanitized potentially malicious input: ${key}`),
}));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use(routes);

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ status: 'error', code: 404, message: 'Route not found' }));

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        status: error.status || 500,
        message: error.message,
        path: req.path,
        method: req.method,
        ...(process.env.ENV_NAME === 'development' && { stack: error.stack }),
    });

    const status  = error.status || 500;
    const message = process.env.ENV_NAME === 'production' && status === 500
        ? 'Internal Server Error'
        : error.message || 'Internal Server Error';

    res.status(status).json({
        status: 'error',
        code: status,
        message,
        ...(process.env.ENV_NAME === 'development' && { stack: error.stack }),
    });
});

module.exports = app;
