/**
 * Bootstrap Index
 * 
 * Exports all bootstrap modules for clean imports
 */

module.exports = {
  database: require('./database'),
  socket: require('./socket'),
  agenda: require('./agenda'),
  shutdown: require('./shutdown'),
  errors: require('./errors')
};
