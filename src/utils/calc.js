// Calcula porcentaje de inasistencia y alerta de 25%.
export function calcularPorcentajeInasistencia(totalClases, presentes, ausenciasRegistradas = 0) {
  const ausencias = Math.max(totalClases - presentes, ausenciasRegistradas);
  if (totalClases === 0) return { porcentaje: 0, ausencias, alerta25: false };
  const porcentaje = (ausencias / totalClases) * 100;
  const alerta25 = porcentaje >= 25;
  return { porcentaje: Math.round(porcentaje * 100) / 100, ausencias, alerta25 };
}
