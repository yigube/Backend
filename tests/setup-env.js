// Ajustes de entorno para que las pruebas usen SQLite en memoria y un secreto predecible.
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_NAME_TEST = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
