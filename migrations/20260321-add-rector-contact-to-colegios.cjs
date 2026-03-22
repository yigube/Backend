'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('colegios', 'rector_nombre', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('colegios', 'rector_apellido', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('colegios', 'rector_correo', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('colegios', 'rector_telefono', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('colegios', 'rector_cedula', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('colegios', 'rector_cedula');
    await queryInterface.removeColumn('colegios', 'rector_telefono');
    await queryInterface.removeColumn('colegios', 'rector_correo');
    await queryInterface.removeColumn('colegios', 'rector_apellido');
    await queryInterface.removeColumn('colegios', 'rector_nombre');
  },
};
