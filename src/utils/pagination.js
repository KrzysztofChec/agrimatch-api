const { unprocessable } = require('./errors');

function parsePagination(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw unprocessable('limit must be an integer between 1 and 100');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw unprocessable('offset must be an integer >= 0');
  }
  return { limit, offset };
}

const envelope = (data, total, { limit, offset }) => ({
  data,
  pagination: { limit, offset, total },
});

module.exports = { parsePagination, envelope };
