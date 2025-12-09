'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('curso_docentes', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      curso_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'cursos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      usuario_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'usuarios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      school_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'colegios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addConstraint('curso_docentes', {
      type: 'unique',
      name: 'curso_docentes_unique',
      fields: ['curso_id', 'usuario_id', 'school_id']
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('curso_docentes', 'curso_docentes_unique');
    await queryInterface.dropTable('curso_docentes');
  }
};
