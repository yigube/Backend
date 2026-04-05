// Valida variables de entorno criticas para arrancar en produccion.
import dotenv from 'dotenv';
dotenv.config();

const requiredCommon = ['JWT_SECRET'];
const requiredMysql = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

export function validateEnv() {
  const missing = [];
  for (const key of requiredCommon) {
    if (!process.env[key]) missing.push(key);
  }

  const dialect = process.env.DB_DIALECT || 'mysql';
  if (process.env.NODE_ENV === 'production') {
    if (dialect === 'mysql') {
      for (const key of requiredMysql) {
        if (!process.env[key]) missing.push(key);
      }
    }
    if (process.env.ALLOW_SYNC_IN_PROD === 'true') {
      console.warn('ADVERTENCIA: ALLOW_SYNC_IN_PROD ya no se usa; el backend arranca sin sync.');
    }
    if (process.env.RUN_DB_MIGRATIONS_ON_START === 'true') {
      console.warn('ADVERTENCIA: RUN_DB_MIGRATIONS_ON_START habilitado; asegura que solo una instancia aplique migraciones al arrancar.');
    }
  }

  if (missing.length) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }
}
