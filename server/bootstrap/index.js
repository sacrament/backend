/**
 * Bootstrap Index
 * 
 * Exports all bootstrap modules for clean imports
 */

module.exports = {
  database: require('./database'),
  socket: require('./socket'),
  shutdown: require('./shutdown'),
  errors: require('./errors')
};
