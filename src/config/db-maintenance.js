import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sequelize } from 'sequelize';
import Umzug from 'umzug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.join(__dirname, '../../migrations');
const brokenTableErrnos = new Set([1813, 1932]);

function getErrorMessage(error) {
  return error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || '';
}

export function isBrokenInnoDbTableError(error) {
  const errno = error?.original?.errno ?? error?.parent?.errno ?? error?.errno;
  const message = getErrorMessage(error);

  return brokenTableErrnos.has(errno)
    || /doesn't exist in engine/i.test(message)
    || /tablespace for table .* exists/i.test(message);
}

export function buildBrokenSchemaMessage(databaseName) {
  return [
    `La base ${databaseName} tiene tablas InnoDB inconsistentes.`,
    'En desarrollo puedes reconstruirla con `npm run db:repair`.',
    'Si necesitas conservar datos, restaura un backup antes de reparar.'
  ].join(' ');
}

export function createMigrator(sequelize) {
  return new Umzug({
    storage: 'sequelize',
    storageOptions: { sequelize },
    logging: false,
    migrations: {
      path: migrationsPath,
      pattern: /\.cjs$/,
      params: [sequelize.getQueryInterface(), Sequelize]
    }
  });
}

export async function runMigrations(sequelize) {
  const migrator = createMigrator(sequelize);
  const pending = await migrator.pending();
  if (!pending.length) return [];
  await migrator.up();
  return pending.map((migration) => migration.file);
}

export async function recreateMySqlDatabase({ host, port, username, password, database }) {
  const admin = new Sequelize('', username, password, {
    host,
    port,
    dialect: 'mysql',
    logging: false
  });

  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`CREATE DATABASE \`${database}\``);
  } finally {
    await admin.close();
  }
}
