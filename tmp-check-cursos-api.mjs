import axios from 'axios';

const baseURL = 'http://localhost:4000';
const login = await axios.post(`${baseURL}/auth/login`, { email: 'admin@central.com', password: 'admin123' });
const token = login.data?.token;
const cursos = await axios.get(`${baseURL}/cursos`, {
  params: { schoolId: 2 },
  headers: { Authorization: `Bearer ${token}` }
});
console.log(cursos.data.map(c => c.nombre).sort().join(', '));
