// Helpers de manejo de errores y wrapper async.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 por defecto si ninguna ruta respondio.
export function notFoundHandler(req, res, next) {
  if (!res.headersSent) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  next();
}

// Respuesta de error centralizada; en dev incluye stack.
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const payload = { error: err.message || 'Error interno' };
  if (process.env.NODE_ENV !== 'production') payload.trace = err.stack;
  if (!res.headersSent) res.status(status).json(payload);
}
