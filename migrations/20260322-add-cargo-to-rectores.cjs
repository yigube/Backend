'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('rectores');
    if (!table.cargo) {
      await queryInterface.addColumn('rectores', 'cargo', {
        type: Sequelize.ENUM('rector', 'coordinador'),
        allowNull: false,
        defaultValue: 'rector'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('rectores');
    if (table.cargo) {
      await queryInterface.removeColumn('rectores', 'cargo');
    }
  },
};
