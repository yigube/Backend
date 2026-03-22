// Controlador de autenticacion JWT.
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Usuario, Colegio, Rector } from "../models/index.js";

/** Login con email/password. Devuelve JWT con rol y schoolId. */
export async function login(req, res) {
  const { email, password } = req.body;
  const emailNorm = String(email || '').trim().toLowerCase();

  const user = await Usuario.findOne({ where: { email: emailNorm } });
  if (user) {
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });
    const colegio = await Colegio.findOne({ where: { id: user.schoolId } });
    // El token incluye rol y colegio para aplicar autorizacion y scoping sin otra consulta.
    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre, schoolId: user.schoolId, schoolName: colegio?.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        schoolId: user.schoolId,
        schoolName: colegio?.nombre || ''
      }
    });
  }

  // Fallback para rector registrado en tabla rectores.
  const rector = await Rector.findOne({ where: { correo: emailNorm } });
  if (!rector?.passwordHash) return res.status(401).json({ error: 'Credenciales invalidas' });

  const okRector = await bcrypt.compare(password, rector.passwordHash);
  if (!okRector) return res.status(401).json({ error: 'Credenciales invalidas' });

  const colegio = await Colegio.findOne({ where: { id: rector.schoolId } });
  const nombreRector = [rector.nombre, rector.apellido].filter(Boolean).join(' ').trim() || 'Rector';
  const token = jwt.sign(
    { id: `rector-${rector.id}`, rol: 'rector', nombre: nombreRector, schoolId: rector.schoolId, schoolName: colegio?.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({
    token,
    user: {
      id: `rector-${rector.id}`,
      nombre: nombreRector,
      email: rector.correo,
      rol: 'rector',
      schoolId: rector.schoolId,
      schoolName: colegio?.nombre || ''
    }
  });
}
