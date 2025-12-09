// Configuracion basica de Jest para pruebas Node.
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup-env.js']
};