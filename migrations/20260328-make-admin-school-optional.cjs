'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('usuarios', 'school_id', {
      allowNull: true,
      type: Sequelize.INTEGER,
      references: { model: 'colegios', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('usuarios', 'school_id', {
      allowNull: false,
      type: Sequelize.INTEGER,
      references: { model: 'colegios', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },
};
