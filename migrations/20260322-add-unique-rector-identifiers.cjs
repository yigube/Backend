'use strict';

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map((item) => (
    typeof item === 'string' ? item : item.tableName || item.table_name || item.name
  ));
  return normalized.includes(tableName);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const hasUnique = async (name) => {
      const [rows] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM rectores WHERE Key_name = '${name}'
      `);
      return Array.isArray(rows) && rows.length > 0;
    };

    const table = await queryInterface.describeTable('rectores');
    const normalizeColumns = ['correo', 'cedula', 'telefono'];

    for (const column of normalizeColumns) {
      if (!table[column]) continue;
      await queryInterface.sequelize.query(`
        UPDATE rectores
        SET ${column} = NULLIF(TRIM(${column}), '')
        WHERE ${column} IS NOT NULL
      `);
    }

    if (table.correo) {
      await queryInterface.sequelize.query(`
        UPDATE rectores
        SET correo = LOWER(correo)
        WHERE correo IS NOT NULL
      `);
    }

    const addUniqueIfNoDuplicates = async (column, constraintName) => {
      if (!table[column]) return;
      const [duplicates] = await queryInterface.sequelize.query(`
        SELECT ${column} AS value, COUNT(*) AS total
        FROM rectores
        WHERE ${column} IS NOT NULL
        GROUP BY ${column}
        HAVING COUNT(*) > 1
      `);
      if (Array.isArray(duplicates) && duplicates.length > 0) {
        throw new Error(`No se puede crear unique en rectores.${column}: hay valores duplicados`);
      }
      if (!(await hasUnique(constraintName))) {
        await queryInterface.addConstraint('rectores', {
          fields: [column],
          type: 'unique',
          name: constraintName
        });
      }
    };

    await addUniqueIfNoDuplicates('correo', 'rectores_correo_unique');
    await addUniqueIfNoDuplicates('cedula', 'rectores_cedula_unique');
    await addUniqueIfNoDuplicates('telefono', 'rectores_telefono_unique');
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const constraints = ['rectores_telefono_unique', 'rectores_cedula_unique', 'rectores_correo_unique'];
    for (const constraint of constraints) {
      try {
        await queryInterface.removeConstraint('rectores', constraint);
      } catch (_) {
        // Ignora si el constraint no existe.
      }
    }
  },
};
