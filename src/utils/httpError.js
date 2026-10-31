module.exports = function httpError(res, error) {
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'An unexpected error occurred.' });
};
