require('dotenv').config();

const common = {
  dialect: process.env.DB_DIALECT || 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || null,
  define: { underscored: true },
  logging: false,
  dialectOptions: process.env.DB_TZ ? { timezone: process.env.DB_TZ } : {},
};

module.exports = {
  development: {
    ...common,
    database: process.env.DB_NAME || 'asistencia_db',
  },
  test: {
    ...common,
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_NAME_TEST || ':memory:',
    database: process.env.DB_NAME_TEST || 'asistencia_db_test',
  },
  production: {
    ...common,
    database: process.env.DB_NAME,
  },
};
