'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('periodos', 'fecha_inicio', {
      type: Sequelize.DATE,
      allowNull: false
    });
    await queryInterface.changeColumn('periodos', 'fecha_fin', {
      type: Sequelize.DATE,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('periodos', 'fecha_inicio', {
      type: Sequelize.DATEONLY,
      allowNull: false
    });
    await queryInterface.changeColumn('periodos', 'fecha_fin', {
      type: Sequelize.DATEONLY,
      allowNull: false
    });
  }
};
