'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');
    if (!table.estado) {
      await queryInterface.addColumn('asistencias', 'estado', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'presente'
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE asistencias
      SET estado = CASE
        WHEN presente = 1 THEN 'presente'
        ELSE 'ausente'
      END
      WHERE estado IS NULL OR estado = ''
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('asistencias');
    if (table.estado) {
      await queryInterface.removeColumn('asistencias', 'estado');
    }
  },
};
