const { unprocessable } = require('./errors');

const integer = (value, fallback) => value === undefined ? fallback :
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;

function parsePagination(query) {
  const limit = integer(query.limit, 20);
  const offset = integer(query.offset, 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw unprocessable('limit must be an integer between 1 and 100');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw unprocessable('offset must be an integer >= 0');
  }
  return { limit, offset };
}

const envelope = (data, total, { limit, offset }) => ({
  data,
  pagination: { limit, offset, total },
});

module.exports = { parsePagination, envelope };
