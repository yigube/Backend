'use strict';

const OLD_UNIQUE_FIELDS = ['fecha', 'estudiante_id', 'curso_id', 'school_id'];
const NEW_UNIQUE_FIELDS = ['fecha', 'estudiante_id', 'curso_id', 'school_id', 'materia_id'];
const NEW_UNIQUE_NAME = 'asistencias_fecha_estudiante_curso_school_materia_unique';
const OLD_UNIQUE_NAME = 'asistencias_fecha_estudiante_curso_school_unique';
const MATERIA_INDEX_NAME = 'asistencias_materia_id_idx';

const normalizeFieldList = (index) => (
  Array.isArray(index?.fields)
    ? index.fields.map((field) => field.attribute || field.name || field)
    : []
);

const sameFields = (left, right) => (
  left.length === right.length
  && left.every((field, index) => String(field) === String(right[index]))
);

const getIndexByFields = (indexes, targetFields, { uniqueOnly = false } = {}) => (
  indexes.find((index) => {
    if (uniqueOnly && !index?.unique) return false;
    return sameFields(normalizeFieldList(index), targetFields);
  })
);

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');

    if (!table.materia_id) {
      await queryInterface.addColumn('asistencias', 'materia_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'materias', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    const allTables = await queryInterface.showAllTables();
    const normalizedTables = allTables.map((item) => (
      typeof item === 'string' ? item : item.tableName || item.table_name || item.name
    ));
    if (normalizedTables.includes('estudiante_materias')) {
      const dialect = queryInterface.sequelize.getDialect();
      if (dialect === 'sqlite') {
        await queryInterface.sequelize.query(`
          UPDATE asistencias
          SET materia_id = (
            SELECT MIN(em.materia_id)
            FROM estudiante_materias em
            WHERE em.estudiante_id = asistencias.estudiante_id
              AND em.curso_id = asistencias.curso_id
              AND em.school_id = asistencias.school_id
            GROUP BY em.estudiante_id, em.curso_id, em.school_id
            HAVING COUNT(*) = 1
          )
          WHERE materia_id IS NULL
        `);
      } else {
        await queryInterface.sequelize.query(`
          UPDATE asistencias a
          JOIN (
            SELECT estudiante_id, curso_id, school_id, MIN(materia_id) AS materia_id
            FROM estudiante_materias
            GROUP BY estudiante_id, curso_id, school_id
            HAVING COUNT(*) = 1
          ) em
            ON em.estudiante_id = a.estudiante_id
           AND em.curso_id = a.curso_id
           AND em.school_id = a.school_id
          SET a.materia_id = em.materia_id
          WHERE a.materia_id IS NULL
        `);
      }
    }

    let indexes = await queryInterface.showIndex('asistencias');
    const oldUnique = getIndexByFields(indexes, OLD_UNIQUE_FIELDS, { uniqueOnly: true });
    if (oldUnique) {
      await queryInterface.removeIndex('asistencias', oldUnique.name || oldUnique.Key_name);
    }

    indexes = await queryInterface.showIndex('asistencias');
    const hasNewUnique = indexes.some((index) => (
      (index.name || index.Key_name) === NEW_UNIQUE_NAME
      || (index.unique && sameFields(normalizeFieldList(index), NEW_UNIQUE_FIELDS))
    ));
    if (!hasNewUnique) {
      await queryInterface.addIndex('asistencias', NEW_UNIQUE_FIELDS, {
        unique: true,
        name: NEW_UNIQUE_NAME
      });
    }

    indexes = await queryInterface.showIndex('asistencias');
    const hasMateriaIndex = indexes.some((index) => (
      (index.name || index.Key_name) === MATERIA_INDEX_NAME
      || sameFields(normalizeFieldList(index), ['materia_id'])
    ));
    if (!hasMateriaIndex) {
      await queryInterface.addIndex('asistencias', ['materia_id'], { name: MATERIA_INDEX_NAME });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');
    if (!table.materia_id) return;

    let indexes = await queryInterface.showIndex('asistencias');
    const newUnique = indexes.find((index) => (
      (index.name || index.Key_name) === NEW_UNIQUE_NAME
      || (index.unique && sameFields(normalizeFieldList(index), NEW_UNIQUE_FIELDS))
    ));
    if (newUnique) {
      await queryInterface.removeIndex('asistencias', newUnique.name || newUnique.Key_name);
    }

    indexes = await queryInterface.showIndex('asistencias');
    const materiaIndex = indexes.find((index) => (
      (index.name || index.Key_name) === MATERIA_INDEX_NAME
      || sameFields(normalizeFieldList(index), ['materia_id'])
    ));
    if (materiaIndex) {
      await queryInterface.removeIndex('asistencias', materiaIndex.name || materiaIndex.Key_name);
    }

    indexes = await queryInterface.showIndex('asistencias');
    const hasOldUnique = indexes.some((index) => (
      (index.name || index.Key_name) === OLD_UNIQUE_NAME
      || (index.unique && sameFields(normalizeFieldList(index), OLD_UNIQUE_FIELDS))
    ));
    if (!hasOldUnique) {
      await queryInterface.addIndex('asistencias', OLD_UNIQUE_FIELDS, {
        unique: true,
        name: OLD_UNIQUE_NAME
      });
    }

    await queryInterface.removeColumn('asistencias', 'materia_id');
  }
};
