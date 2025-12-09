// Inicializa Sequelize y sincroniza el esquema; en test crea la BD si no existe.
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const dialect = process.env.DB_DIALECT || 'mysql';
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 3306;
const dbName = isTest
  ? process.env.DB_NAME_TEST || process.env.DB_NAME || 'asistencia_db_test'
  : process.env.DB_NAME || 'asistencia_db';

export const sequelize = new Sequelize(dbName, process.env.DB_USER, process.env.DB_PASSWORD, {
  host,
  port,
  dialect,
  logging: false,
  define: { underscored: true },
  pool: { max: 15, min: 0, acquire: 20000, idle: 10000 },
  dialectOptions: { timezone: process.env.DB_TZ }
});

// Crea la base en MySQL cuando corre en modo test para evitar fallos por schema inexistente.
async function ensureDatabaseExists(name) {
  if (dialect !== 'mysql') return;
  const admin = new Sequelize('', process.env.DB_USER, process.env.DB_PASSWORD, {
    host,
    port,
    dialect,
    logging: false
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  await admin.close();
}

// Abre conexion y sincroniza el esquema; en dev intenta alter y fuerza si hay incompatibilidades.
export async function connectDB() {
  try {
    if (isTest) await ensureDatabaseExists(dbName);
    await sequelize.authenticate();
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.ALLOW_SYNC_IN_PROD !== 'true') {
      console.log('DB connected (sin sync en produccion; aplica migraciones antes de arrancar)');
      return;
    }

    const syncOptions = isTest ? { force: true } : { alter: true }; // En prod usar migraciones
    try {
      await sequelize.sync(syncOptions); // En prod usar migraciones en lugar de sync
    } catch (err) {
      const canForce = process.env.NODE_ENV !== 'production' && !isTest;
      if (canForce) {
        console.warn('Sync con alter fallo, reintentando con force (reinicia tablas en dev):', err.message);
        await sequelize.sync({ force: true });
      } else {
        throw err;
      }
    }
    console.log(`DB connected and synced (${dbName})`);
  } catch (e) {
    console.error('DB connection error:', e.message);
    throw e;
  }
}
