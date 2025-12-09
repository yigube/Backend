// Middleware de autenticacion via JWT para rutas protegidas.
import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.schoolId) return res.status(401).json({ error: 'Token invalido' });
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}
