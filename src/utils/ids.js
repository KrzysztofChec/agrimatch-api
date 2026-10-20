const { z } = require('zod');
const { notFound } = require('./errors');

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const idSchema = z.string().regex(OBJECT_ID, 'must be a valid id');

// Path ids that are malformed can never match anything -> 404.
function parseId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) throw notFound();
  return value;
}

module.exports = { idSchema, parseId };
