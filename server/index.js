/**
 * Express Application Setup
 * 
 * Configures Express middleware, routes, and error handling
 */

const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');

// Route imports
const chatRoute = require('./api/routes/chat');
const indexRoute = require('./api/routes/index');
const userRoute = require('./api/routes/user');
const callRoute = require('./api/routes/call');

// Middleware imports
const { verifyToken } = require('./middleware/verify');

// Initialize Express app
const app = express();

/**
 * Global Middleware - Applied to all requests
 */
app.use(compression()); // Gzip compression
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cookieParser()); // Parse cookies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

/**
 * API Routes Configuration
 */
const apiRoutes = express.Router();

// Chat routes (requires authentication)
apiRoutes.use('/chat', verifyToken, chatRoute);

// User routes (public)
apiRoutes.use('/user', userRoute);

// Call routes (public)
apiRoutes.use('/call', callRoute);

// Health check and index routes
app.use('/', indexRoute);

// All API routes under /api prefix
app.use('/api', apiRoutes);

/**
 * Request/Response Logging Middleware (optional)
 * Uncomment to enable request logging
 */
app.use((req, res, next) => {
  // console.log(`${req.method} ${req.url}`);
  next();
});

/**
 * Global Error Handler
 * 
 * Must be the last middleware defined
 * Catches all errors thrown in route handlers and middleware
 */
app.use((error, req, res, next) => {
  // Log error details
  console.error('Error:', {
    status: error.status || 500,
    message: error.message,
    stack: error.stack
  });

  // Prepare error response
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';

  // Send response
  res.status(status).json({
    status: 'error',
    code: status,
    message: message,
    ...(process.env.ENV_NAME === 'development' && { stack: error.stack })
  });
});

module.exports = app;
