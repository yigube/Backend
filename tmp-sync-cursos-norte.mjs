import { sequelize } from './src/config/database.js';

await sequelize.query("INSERT INTO cursos (nombre, school_id, created_at, updated_at) SELECT c.nombre, 2, NOW(), NOW() FROM cursos c WHERE c.school_id = 1 AND c.nombre REGEXP '^(6|7|8|9|10|11)' AND NOT EXISTS (SELECT 1 FROM cursos c2 WHERE c2.school_id = 2 AND c2.nombre = c.nombre)");
const [rows] = await sequelize.query("SELECT id, nombre, school_id as schoolId FROM cursos WHERE school_id = 2 ORDER BY nombre");
console.log(JSON.stringify(rows, null, 2));
await sequelize.close();
