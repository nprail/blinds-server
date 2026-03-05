import logger from '../utils/logger.js';

/**
 * Express 5 error-handling middleware.
 *
 * Must have exactly four parameters so Express recognises it as an error
 * handler.  Express 5 async route handlers propagate thrown errors here
 * automatically — no try/catch required in controllers.
 *
 * @param {Error}    err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next  (unused but required)
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  if (status >= 500) {
    logger.error(`${req.method} ${req.path} → ${status}: ${message}`, {
      stack: err.stack,
    });
  } else {
    logger.warn(`${req.method} ${req.path} → ${status}: ${message}`);
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
