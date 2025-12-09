// Configura Express, middlewares, rutas y conexion a DB.
import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { connectDB } from './config/database.js';
import { validateEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

dotenv.config();
validateEnv();
const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
const corsOptions = allowedOrigins.length
  ? { origin: allowedOrigins, credentials: true }
  : { origin: '*', credentials: false }; // Evita credenciales con wildcard bloqueadas por navegador

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET es requerido para iniciar el servidor.');
}

if (!process.env.JWT_SECRET) {
  console.warn('ADVERTENCIA: JWT_SECRET no definido; se usara un valor inseguro "dev".');
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: process.env.BODY_LIMIT || '512kb' }));
app.use(morgan('dev'));
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 500),
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.get('/', (req, res) => res.json({ ok: true, name: 'asistencia-backend' }));
app.use('/', routes);
app.use(notFoundHandler);
app.use(errorHandler);

// Inicializa conexion a BD antes de devolver la app (util en server y pruebas).
export async function init() {
  await connectDB();
  return app;
}

export default app;
