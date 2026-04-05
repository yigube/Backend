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
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const hasUnique = async (name) => {
      const [rows] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM rectores WHERE Key_name = '${name}'
      `);
      return Array.isArray(rows) && rows.length > 0;
    };

    let table = await queryInterface.describeTable('rectores');
    if (!table.cargo) {
      await queryInterface.addColumn('rectores', 'cargo', {
        type: Sequelize.ENUM('rector', 'coordinador'),
        allowNull: false,
        defaultValue: 'rector'
      });
    }
    if (!table.password_hash) {
      await queryInterface.addColumn('rectores', 'password_hash', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    table = await queryInterface.describeTable('rectores');

    const normalizeColumn = async (column) => {
      if (!table[column]) return;
      await queryInterface.sequelize.query(`
        UPDATE rectores
        SET ${column} = NULLIF(TRIM(${column}), '')
        WHERE ${column} IS NOT NULL
      `);
    };

    await normalizeColumn('correo');
    await normalizeColumn('cedula');
    await normalizeColumn('telefono');

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

    const colegios = await queryInterface.describeTable('colegios');
    const legacyColumns = ['rector_nombre', 'rector_apellido', 'rector_correo', 'rector_telefono', 'rector_cedula'];
    for (const column of legacyColumns) {
      if (colegios[column]) {
        await queryInterface.removeColumn('colegios', column);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'colegios'))) return;
    const colegios = await queryInterface.describeTable('colegios');
    if (!colegios.rector_nombre) {
      await queryInterface.addColumn('colegios', 'rector_nombre', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_apellido) {
      await queryInterface.addColumn('colegios', 'rector_apellido', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_correo) {
      await queryInterface.addColumn('colegios', 'rector_correo', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_telefono) {
      await queryInterface.addColumn('colegios', 'rector_telefono', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_cedula) {
      await queryInterface.addColumn('colegios', 'rector_cedula', { type: Sequelize.STRING, allowNull: true });
    }

    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const rectores = await queryInterface.describeTable('rectores');
    if (rectores.correo) {
      await queryInterface.removeConstraint('rectores', 'rectores_correo_unique');
    }
  },
};
