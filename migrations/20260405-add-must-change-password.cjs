'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const usuariosTable = await queryInterface.describeTable('usuarios');
    if (!usuariosTable.must_change_password) {
      await queryInterface.addColumn('usuarios', 'must_change_password', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    const rectoresTable = await queryInterface.describeTable('rectores');
    if (!rectoresTable.must_change_password) {
      await queryInterface.addColumn('rectores', 'must_change_password', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    const usuariosTable = await queryInterface.describeTable('usuarios');
    if (usuariosTable.must_change_password) {
      await queryInterface.removeColumn('usuarios', 'must_change_password');
    }

    const rectoresTable = await queryInterface.describeTable('rectores');
    if (rectoresTable.must_change_password) {
      await queryInterface.removeColumn('rectores', 'must_change_password');
    }
  }
};
