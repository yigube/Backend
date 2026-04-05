// Inicializa Sequelize y prepara el esquema; en test crea la BD si no existe.
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { buildBrokenSchemaMessage, isBrokenInnoDbTableError, runMigrations } from './db-maintenance.js';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const dialect = process.env.DB_DIALECT || 'mysql';
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 3306;
const dbName = isTest
  ? process.env.DB_NAME_TEST || process.env.DB_NAME || 'asistencia_db_test'
  : process.env.DB_NAME || 'asistencia_db';
const username = process.env.DB_USER;
const password = process.env.DB_PASSWORD;

export const sequelize = new Sequelize(dbName, username, password, {
  host,
  port,
  dialect,
  logging: false,
  define: { underscored: true },
  pool: { max: 15, min: 0, acquire: 20000, idle: 10000 },
  dialectOptions: { timezone: process.env.DB_TZ }
});

export const dbConfig = {
  database: dbName,
  host,
  port,
  dialect,
  username,
  password
};

// Crea la base en MySQL cuando corre en modo test para evitar fallos por schema inexistente.
async function ensureDatabaseExists(name) {
  if (dialect !== 'mysql') return;
  const admin = new Sequelize('', username, password, {
    host,
    port,
    dialect,
    logging: false
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  await admin.close();
}

// Abre conexion y prepara el esquema. En test usa sync forzado; fuera de test aplica migraciones.
export async function connectDB() {
  try {
    if (isTest) await ensureDatabaseExists(dbName);
    await sequelize.authenticate();

    if (isTest) {
      await sequelize.sync({ force: true });
      console.log(`DB connected and synced (${dbName})`);
      return;
    }

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.RUN_DB_MIGRATIONS_ON_START !== 'true') {
      console.log('DB connected (sin sync en produccion; aplica migraciones antes de arrancar)');
      return;
    }

    const appliedMigrations = await runMigrations(sequelize);
    if (appliedMigrations.length) {
      console.log(`DB connected and migrated (${dbName}): ${appliedMigrations.join(', ')}`);
      return;
    }

    console.log(`DB connected (${dbName})`);
  } catch (e) {
    if (isBrokenInnoDbTableError(e)) {
      console.error('DB schema error:', buildBrokenSchemaMessage(dbName));
    }
    console.error('DB connection error:', e.message);
    throw e;
  }
}
