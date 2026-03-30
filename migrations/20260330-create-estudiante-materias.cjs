'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const allTables = await queryInterface.showAllTables();
    const normalizedTables = allTables.map((item) => (
      typeof item === 'string' ? item : item.tableName || item.table_name || item.name
    ));
    if (!normalizedTables.includes('estudiante_materias')) {
      await queryInterface.createTable('estudiante_materias', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        estudiante_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'estudiantes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        curso_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'cursos', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        materia_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'materias', key: 'id' },
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
    }

    const indexes = await queryInterface.showIndex('estudiante_materias');
    const hasUnique = indexes.some((item) => (item.name || item.Key_name) === 'estudiante_materias_unique');
    if (!hasUnique) {
      await queryInterface.addConstraint('estudiante_materias', {
        type: 'unique',
        name: 'estudiante_materias_unique',
        fields: ['estudiante_id', 'curso_id', 'materia_id', 'school_id']
      });
    }
  },

  async down(queryInterface) {
    const allTables = await queryInterface.showAllTables();
    const normalizedTables = allTables.map((item) => (
      typeof item === 'string' ? item : item.tableName || item.table_name || item.name
    ));
    if (!normalizedTables.includes('estudiante_materias')) return;

    const indexes = await queryInterface.showIndex('estudiante_materias');
    const hasUnique = indexes.some((item) => (item.name || item.Key_name) === 'estudiante_materias_unique');
    if (hasUnique) {
      await queryInterface.removeConstraint('estudiante_materias', 'estudiante_materias_unique');
    }
    await queryInterface.dropTable('estudiante_materias');
  }
};
