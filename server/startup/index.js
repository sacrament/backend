module.exports = {
  db:       require('../db/bootstrap'),
  socket:   require('../socket/bootstrap'),
  agenda:   require('./agenda'),
  shutdown: require('./shutdown'),
  errors:   require('./errors'),
};
