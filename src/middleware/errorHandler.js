const { ZodError } = require('zod');
const { HttpError } = require('../utils/errors');

function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'Not Found', 'Route not found.'));
}

// RFC 9457 problem details. Never leaks stack traces or database errors.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = 500;
  let title = 'Internal Server Error';
  let detail = 'An unexpected error occurred.';

  if (err instanceof HttpError) {
    ({ status, title, detail } = err);
  } else if (err instanceof ZodError) {
    status = 422;
    title = 'Unprocessable Content';
    detail = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
  } else if (err.type === 'entity.parse.failed') {
    status = 400; title = 'Bad Request'; detail = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413; title = 'Payload Too Large'; detail = 'Request body is too large.';
  } else if (err.code === 11000) {
    status = 409; title = 'Conflict'; detail = 'A resource with these unique values already exists.';
  } else {
    console.error(err);
  }

  res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title, status, detail, instance: req.originalUrl });
}

module.exports = { notFoundHandler, errorHandler };
