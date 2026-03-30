'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql') return;

    const tableName = 'docente_curso_materias';
    const description = await queryInterface.describeTable(tableName);
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    const primaryColumns = indexes
      .filter((item) => item.Key_name === 'PRIMARY')
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
      .map((item) => item.Column_name);
    const hasIdColumn = Object.prototype.hasOwnProperty.call(description, 'id');
    const hasIdPrimary = primaryColumns.length === 1 && primaryColumns[0] === 'id';
    const hasMateriaIndex = indexes.some((item) => item.Key_name === 'materia_id');

    if (!hasMateriaIndex) {
      await queryInterface.addIndex(tableName, ['materia_id'], { name: 'materia_id' });
    }

    if (!hasIdColumn) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\`
        DROP PRIMARY KEY,
        ADD COLUMN \`id\` INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST
      `);
      return;
    }

    if (!hasIdPrimary) {
      await queryInterface.changeColumn(tableName, 'id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true
      });
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\`
        DROP PRIMARY KEY,
        ADD PRIMARY KEY (\`id\`)
      `);
    }
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql') return;

    const tableName = 'docente_curso_materias';
    const description = await queryInterface.describeTable(tableName);
    if (!Object.prototype.hasOwnProperty.call(description, 'id')) return;

    await queryInterface.sequelize.query(`
      ALTER TABLE \`${tableName}\`
      DROP PRIMARY KEY,
      DROP COLUMN \`id\`,
      ADD PRIMARY KEY (\`materia_id\`, \`usuario_id\`)
    `);

    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    const hasMateriaIndex = indexes.some((item) => item.Key_name === 'materia_id');
    if (hasMateriaIndex) {
      await queryInterface.removeIndex(tableName, 'materia_id');
    }
  }
};
