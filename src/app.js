// Configura Express, middlewares, rutas y conexion a DB.
import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { connectDB, dbConfig, sequelize } from './config/database.js';
import { validateEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { createCorsOriginOption } from './utils/cors.js';
import { getDatabaseHealth, getMetricsSnapshot, requestMetricsMiddleware } from './utils/observability.js';

dotenv.config();
validateEnv();
const app = express();

const corsOriginOption = createCorsOriginOption(process.env.CORS_ORIGINS);
const corsOptions = corsOriginOption !== '*'
  ? { origin: corsOriginOption, credentials: true }
  : { origin: '*', credentials: false }; // Evita credenciales con wildcard bloqueadas por navegador

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET es requerido para iniciar el servidor.');
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: process.env.BODY_LIMIT || '512kb' }));
app.use(requestMetricsMiddleware);
if (process.env.LOG_FORMAT !== 'json' && process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 1000 : 500)),
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.get('/', (req, res) => res.json({ ok: true, name: 'asistencia-backend' }));
app.get('/health', async (req, res) => {
  const database = await getDatabaseHealth(sequelize);
  const healthy = database.status === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'asistencia-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime ? Math.floor(process.uptime()) : 0,
    database: {
      status: database.status,
      dialect: dbConfig.dialect,
      name: dbConfig.database,
      message: database.message || null
    },
    metrics: getMetricsSnapshot().counters
  });
});
app.get('/metrics', (req, res) => {
  res.json(getMetricsSnapshot());
});
app.use('/', routes);
app.use(notFoundHandler);
app.use(errorHandler);

// Inicializa conexion a BD antes de devolver la app (util en server y pruebas).
export async function init() {
  await connectDB();
  return app;
}

export default app;
