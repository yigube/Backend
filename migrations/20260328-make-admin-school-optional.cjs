'use strict';

async function findForeignKeyName(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  return Array.isArray(rows) && rows[0] ? rows[0].CONSTRAINT_NAME : null;
}

async function updateSchoolForeignKey(queryInterface, Sequelize, { allowNull, onDelete }) {
  const constraintName = await findForeignKeyName(queryInterface, 'usuarios', 'school_id');
  if (constraintName) {
    await queryInterface.removeConstraint('usuarios', constraintName);
  }

  await queryInterface.changeColumn('usuarios', 'school_id', {
    allowNull,
    type: Sequelize.INTEGER
  });

  await queryInterface.addConstraint('usuarios', {
    fields: ['school_id'],
    type: 'foreign key',
    name: 'usuarios_school_id_fkey',
    references: { table: 'colegios', field: 'id' },
    onUpdate: 'CASCADE',
    onDelete
  });
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await updateSchoolForeignKey(queryInterface, Sequelize, {
      allowNull: true,
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await updateSchoolForeignKey(queryInterface, Sequelize, {
      allowNull: false,
      onDelete: 'CASCADE'
    });
  },
};
