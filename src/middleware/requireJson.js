const { HttpError } = require('../utils/errors');

// 415 when a POST/PATCH carries a body that is not JSON.
module.exports = (req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PATCH') && req.is('application/json') === false) {
    return next(new HttpError(415, 'Unsupported Media Type', 'Content-Type must be application/json.'));
  }
  return next();
};
