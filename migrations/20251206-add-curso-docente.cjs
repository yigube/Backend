'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    let tableExists = true;
    try {
      await queryInterface.describeTable('curso_docentes');
    } catch {
      tableExists = false;
    }

    if (!tableExists) {
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
    }

    const indexes = await queryInterface.showIndex('curso_docentes');
    const hasUniqueIndex = Array.isArray(indexes) && indexes.some((idx) => idx?.name === 'curso_docentes_unique');
    if (!hasUniqueIndex) {
      await queryInterface.addConstraint('curso_docentes', {
        type: 'unique',
        name: 'curso_docentes_unique',
        fields: ['curso_id', 'usuario_id', 'school_id']
      });
    }
  },

  async down(queryInterface) {
    try {
      const indexes = await queryInterface.showIndex('curso_docentes');
      const hasUniqueIndex = Array.isArray(indexes) && indexes.some((idx) => idx?.name === 'curso_docentes_unique');
      if (hasUniqueIndex) {
        await queryInterface.removeConstraint('curso_docentes', 'curso_docentes_unique');
      }
    } catch {}

    await queryInterface.dropTable('curso_docentes');
  }
};
