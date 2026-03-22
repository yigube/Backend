'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');

    if (!table.tarde) {
      await queryInterface.addColumn('asistencias', 'tarde', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!table.afuera) {
      await queryInterface.addColumn('asistencias', 'afuera', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!table.ausente) {
      await queryInterface.addColumn('asistencias', 'ausente', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE asistencias
      SET
        tarde = CASE WHEN estado = 'tarde' THEN 1 ELSE 0 END,
        afuera = CASE WHEN estado = 'afuera' THEN 1 ELSE 0 END,
        ausente = CASE WHEN estado = 'ausente' THEN 1 ELSE 0 END
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('asistencias');
    if (table.tarde) await queryInterface.removeColumn('asistencias', 'tarde');
    if (table.afuera) await queryInterface.removeColumn('asistencias', 'afuera');
    if (table.ausente) await queryInterface.removeColumn('asistencias', 'ausente');
  }
};
