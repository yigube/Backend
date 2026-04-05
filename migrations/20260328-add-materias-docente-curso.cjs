'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    let materiasExists = true;
    try {
      await queryInterface.describeTable('materias');
    } catch {
      materiasExists = false;
    }

    if (!materiasExists) {
      await queryInterface.createTable('materias', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        nombre: { allowNull: false, type: Sequelize.STRING },
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

    const materiasIndexes = await queryInterface.showIndex('materias');
    const hasMateriasUnique = Array.isArray(materiasIndexes) && materiasIndexes.some((idx) => idx?.name === 'materias_school_nombre_unique');
    if (!hasMateriasUnique) {
      await queryInterface.addConstraint('materias', {
        type: 'unique',
        name: 'materias_school_nombre_unique',
        fields: ['school_id', 'nombre']
      });
    }

    let docenteCursoMateriasExists = true;
    try {
      await queryInterface.describeTable('docente_curso_materias');
    } catch {
      docenteCursoMateriasExists = false;
    }

    if (!docenteCursoMateriasExists) {
      await queryInterface.createTable('docente_curso_materias', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        usuario_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'usuarios', key: 'id' },
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

    const docenteCursoMateriasIndexes = await queryInterface.showIndex('docente_curso_materias');
    const hasDocenteCursoMateriasUnique = Array.isArray(docenteCursoMateriasIndexes)
      && docenteCursoMateriasIndexes.some((idx) => idx?.name === 'docente_curso_materias_unique');
    if (!hasDocenteCursoMateriasUnique) {
      await queryInterface.addConstraint('docente_curso_materias', {
        type: 'unique',
        name: 'docente_curso_materias_unique',
        fields: ['usuario_id', 'curso_id', 'materia_id', 'school_id']
      });
    }
  },

  async down(queryInterface) {
    try {
      const docenteCursoMateriasIndexes = await queryInterface.showIndex('docente_curso_materias');
      const hasDocenteCursoMateriasUnique = Array.isArray(docenteCursoMateriasIndexes)
        && docenteCursoMateriasIndexes.some((idx) => idx?.name === 'docente_curso_materias_unique');
      if (hasDocenteCursoMateriasUnique) {
        await queryInterface.removeConstraint('docente_curso_materias', 'docente_curso_materias_unique');
      }
    } catch {}
    await queryInterface.dropTable('docente_curso_materias');

    try {
      const materiasIndexes = await queryInterface.showIndex('materias');
      const hasMateriasUnique = Array.isArray(materiasIndexes) && materiasIndexes.some((idx) => idx?.name === 'materias_school_nombre_unique');
      if (hasMateriasUnique) {
        await queryInterface.removeConstraint('materias', 'materias_school_nombre_unique');
      }
    } catch {}
    await queryInterface.dropTable('materias');
  }
};
