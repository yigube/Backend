'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');

    if (!table.hora_registro) {
      await queryInterface.addColumn('asistencias', 'hora_registro', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    const dialect = queryInterface.sequelize.getDialect();
    const fallbackNow = dialect === 'sqlite' ? 'CURRENT_TIMESTAMP' : 'NOW()';
    await queryInterface.sequelize.query(`
      UPDATE asistencias
      SET hora_registro = COALESCE(hora_registro, updated_at, created_at, ${fallbackNow})
      WHERE hora_registro IS NULL
    `);

    await queryInterface.changeColumn('asistencias', 'hora_registro', {
      type: Sequelize.DATE,
      allowNull: false
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('asistencias');
    if (table.hora_registro) {
      await queryInterface.removeColumn('asistencias', 'hora_registro');
    }
  }
};
