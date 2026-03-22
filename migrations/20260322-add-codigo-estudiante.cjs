'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('estudiantes');
    if (!table.codigo_estudiante) {
      await queryInterface.addColumn('estudiantes', 'codigo_estudiante', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('estudiantes');
    if (table.codigo_estudiante) {
      await queryInterface.removeColumn('estudiantes', 'codigo_estudiante');
    }
  },
};

