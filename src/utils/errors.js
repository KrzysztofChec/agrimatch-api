class HttpError extends Error {
  constructor(status, title, detail) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.detail = detail || title;
  }
}

module.exports = {
  HttpError,
  unauthorized: (d = 'Authentication is required.') => new HttpError(401, 'Unauthorized', d),
  forbidden: (d = 'You are not allowed to do this.') => new HttpError(403, 'Forbidden', d),
  notFound: (d = 'Resource not found.') => new HttpError(404, 'Not Found', d),
  conflict: (d) => new HttpError(409, 'Conflict', d),
  unprocessable: (d) => new HttpError(422, 'Unprocessable Content', d),
};
