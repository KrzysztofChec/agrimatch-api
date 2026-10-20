const jwt = require('jsonwebtoken');
const config = require('../config');
const Farmer = require('../models/Farmer');
const asyncHandler = require('../utils/asyncHandler');
const { unauthorized } = require('../utils/errors');

// Identity always comes from the verified token, never from the request body.
module.exports = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token.');
  }
  const farmer = await Farmer.findById(payload.sub);
  if (!farmer) throw unauthorized('Invalid or expired token.');
  req.farmer = farmer;
  next();
});
