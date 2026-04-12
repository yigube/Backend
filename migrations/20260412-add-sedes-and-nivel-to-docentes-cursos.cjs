'use strict';

const TABLE_SEDES = 'sedes';
const TABLE_CURSOS = 'cursos';
const TABLE_USUARIOS = 'usuarios';
const TABLE_COLEGIOS = 'colegios';
const NIVEL_VALUES = ['primaria', 'secundaria'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const allTables = await queryInterface.showAllTables();
    const normalizedTables = allTables.map((item) => (
      typeof item === 'string' ? item : item.tableName || item.table_name || item.name
    ));

    if (!normalizedTables.includes(TABLE_SEDES)) {
      await queryInterface.createTable(TABLE_SEDES, {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        nombre: { allowNull: false, type: Sequelize.STRING(120) },
        school_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: TABLE_COLEGIOS, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        created_at: { allowNull: false, type: Sequelize.DATE },
        updated_at: { allowNull: false, type: Sequelize.DATE }
      });
    }

    const sedesIndexes = await queryInterface.showIndex(TABLE_SEDES);
    const hasSedesUnique = sedesIndexes.some((item) => (item.name || item.Key_name) === 'sedes_school_nombre_unique');
    if (!hasSedesUnique) {
      await queryInterface.addConstraint(TABLE_SEDES, {
        type: 'unique',
        name: 'sedes_school_nombre_unique',
        fields: ['school_id', 'nombre']
      });
    }

    const cursosDesc = await queryInterface.describeTable(TABLE_CURSOS);
    if (!cursosDesc.sede_id) {
      await queryInterface.addColumn(TABLE_CURSOS, 'sede_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: TABLE_SEDES, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!cursosDesc.nivel) {
      await queryInterface.addColumn(TABLE_CURSOS, 'nivel', {
        type: Sequelize.ENUM(...NIVEL_VALUES),
        allowNull: true
      });
    }

    const usuariosDesc = await queryInterface.describeTable(TABLE_USUARIOS);
    if (!usuariosDesc.sede_id) {
      await queryInterface.addColumn(TABLE_USUARIOS, 'sede_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: TABLE_SEDES, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!usuariosDesc.nivel) {
      await queryInterface.addColumn(TABLE_USUARIOS, 'nivel', {
        type: Sequelize.ENUM(...NIVEL_VALUES),
        allowNull: true
      });
    }

    // Crea una sede base por colegio y asigna referencias existentes para compatibilidad.
    const [colegios] = await queryInterface.sequelize.query(`SELECT id FROM ${TABLE_COLEGIOS}`);
    for (const colegio of colegios) {
      const schoolId = Number(colegio?.id);
      if (!Number.isInteger(schoolId) || schoolId <= 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id FROM ${TABLE_SEDES} WHERE school_id = :schoolId ORDER BY id ASC LIMIT 1`,
        { replacements: { schoolId } }
      );
      let sedeId = Number(rows?.[0]?.id || 0);
      if (!Number.isInteger(sedeId) || sedeId <= 0) {
        // eslint-disable-next-line no-await-in-loop
        const [insertResult] = await queryInterface.sequelize.query(
          `INSERT INTO ${TABLE_SEDES} (nombre, school_id, created_at, updated_at) VALUES ('Principal', :schoolId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          { replacements: { schoolId } }
        );
        sedeId = Number(insertResult?.insertId || 0);
        if (!Number.isInteger(sedeId) || sedeId <= 0) {
          // eslint-disable-next-line no-await-in-loop
          const [fallbackRows] = await queryInterface.sequelize.query(
            `SELECT id FROM ${TABLE_SEDES} WHERE school_id = :schoolId ORDER BY id ASC LIMIT 1`,
            { replacements: { schoolId } }
          );
          sedeId = Number(fallbackRows?.[0]?.id || 0);
        }
      }
      if (!Number.isInteger(sedeId) || sedeId <= 0) continue;
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE ${TABLE_CURSOS} SET sede_id = :sedeId WHERE school_id = :schoolId AND sede_id IS NULL`,
        { replacements: { sedeId, schoolId } }
      );
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE ${TABLE_USUARIOS} SET sede_id = :sedeId WHERE school_id = :schoolId AND rol = 'docente' AND sede_id IS NULL`,
        { replacements: { sedeId, schoolId } }
      );
    }
  },

  async down(queryInterface) {
    const cursosDesc = await queryInterface.describeTable(TABLE_CURSOS);
    if (cursosDesc.sede_id) await queryInterface.removeColumn(TABLE_CURSOS, 'sede_id');
    if (cursosDesc.nivel) await queryInterface.removeColumn(TABLE_CURSOS, 'nivel');

    const usuariosDesc = await queryInterface.describeTable(TABLE_USUARIOS);
    if (usuariosDesc.sede_id) await queryInterface.removeColumn(TABLE_USUARIOS, 'sede_id');
    if (usuariosDesc.nivel) await queryInterface.removeColumn(TABLE_USUARIOS, 'nivel');

    const allTables = await queryInterface.showAllTables();
    const normalizedTables = allTables.map((item) => (
      typeof item === 'string' ? item : item.tableName || item.table_name || item.name
    ));
    if (!normalizedTables.includes(TABLE_SEDES)) return;

    const sedesIndexes = await queryInterface.showIndex(TABLE_SEDES);
    const hasSedesUnique = sedesIndexes.some((item) => (item.name || item.Key_name) === 'sedes_school_nombre_unique');
    if (hasSedesUnique) {
      await queryInterface.removeConstraint(TABLE_SEDES, 'sedes_school_nombre_unique');
    }
    await queryInterface.dropTable(TABLE_SEDES);
  }
};
