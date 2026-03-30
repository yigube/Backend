'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql') return;

    const tableName = 'docente_curso_materias';
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    const grouped = indexes.reduce((acc, item) => {
      if (!acc[item.Key_name]) acc[item.Key_name] = [];
      acc[item.Key_name].push(item);
      return acc;
    }, {});

    const invalidIndexNames = Object.entries(grouped)
      .filter(([keyName, items]) => {
        if (keyName === 'PRIMARY') return false;
        if (Number(items[0]?.Non_unique) !== 0) return false;
        const columns = items
          .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
          .map((item) => item.Column_name);
        const signature = columns.join(',');
        return signature === 'usuario_id,materia_id' || signature === 'curso_id';
      })
      .map(([keyName]) => keyName);

    const hasCursoIndex = indexes.some((item) => item.Key_name === 'curso_id');
    if (invalidIndexNames.includes('docente_curso_materias_materiaId_cursoId_unique') && !hasCursoIndex) {
      await queryInterface.addIndex(tableName, ['curso_id'], { name: 'curso_id' });
    }

    for (const indexName of invalidIndexNames) {
      await queryInterface.removeIndex(tableName, indexName);
    }
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'mysql') return;

    const tableName = 'docente_curso_materias';
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    const existingNames = new Set(indexes.map((item) => item.Key_name));

    if (!existingNames.has('docente_curso_materias_materiaId_usuarioId_unique')) {
      await queryInterface.addIndex(tableName, ['usuario_id', 'materia_id'], {
        unique: true,
        name: 'docente_curso_materias_materiaId_usuarioId_unique'
      });
    }

    if (!existingNames.has('docente_curso_materias_materiaId_cursoId_unique')) {
      await queryInterface.addIndex(tableName, ['curso_id'], {
        unique: true,
        name: 'docente_curso_materias_materiaId_cursoId_unique'
      });
    }
  }
};
