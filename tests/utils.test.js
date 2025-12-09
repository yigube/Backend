// Pruebas unitarias de utilidades puras.
import { calcularPorcentajeInasistencia } from '../src/utils/calc.js';
import { toCSV } from '../src/utils/csv.js';

describe('calcularPorcentajeInasistencia', () => {
  test('retorna 0% sin clases registradas', () => {
    const res = calcularPorcentajeInasistencia(0, 0);
    expect(res).toEqual({ porcentaje: 0, ausencias: 0, alerta25: false });
  });

  test('detecta alerta al llegar al 25%', () => {
    const res = calcularPorcentajeInasistencia(8, 6, 0);
    expect(res.porcentaje).toBe(25);
    expect(res.ausencias).toBe(2);
    expect(res.alerta25).toBe(true);
  });

  test('usa el maximo entre ausencias calculadas y registradas', () => {
    const res = calcularPorcentajeInasistencia(8, 6, 3);
    expect(res.ausencias).toBe(3); // override por ausencias registradas
    expect(res.porcentaje).toBe(37.5);
  });
});

describe('toCSV', () => {
  test('genera CSV con encabezados y filas', async () => {
    const rows = [
      { fecha: '2025-01-01', cursoId: 1, periodoId: 2, estudianteId: 3, estudiante: 'Ana Lopez', presente: 'SI' },
      { fecha: '2025-01-02', cursoId: 1, periodoId: 2, estudianteId: 4, estudiante: 'Luis Perez', presente: 'NO' },
    ];
    const csv = await toCSV(rows);
    expect(csv).toContain('fecha,cursoId,periodoId,estudianteId,estudiante,presente');
    expect(csv).toContain('2025-01-01,1,2,3,Ana Lopez,SI');
    expect(csv).toContain('2025-01-02,1,2,4,Luis Perez,NO');
  });
});
