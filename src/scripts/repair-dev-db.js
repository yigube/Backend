import dotenv from 'dotenv';
import { dbConfig, sequelize } from '../config/database.js';
import { recreateMySqlDatabase, runMigrations } from '../config/db-maintenance.js';

dotenv.config();

async function repair() {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error('La reparacion automatica esta bloqueada en produccion.');
  }

  if (dbConfig.dialect !== 'mysql') {
    throw new Error('La reparacion automatica solo soporta MySQL.');
  }

  await recreateMySqlDatabase(dbConfig);
  await sequelize.authenticate();
  const applied = await runMigrations(sequelize);

  console.log(`Base ${dbConfig.database} recreada correctamente.`);
  if (applied.length) {
    console.log(`Migraciones aplicadas: ${applied.join(', ')}`);
  } else {
    console.log('No habia migraciones pendientes tras recrear la base.');
  }
}

repair()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Fallo reparando la base:', error.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
