// Helpers para normalizar y agrupar asistencias por estudiante/fecha.

const ESTADO_PRIORITY = {
  presente: 0,
  tarde: 1,
  afuera: 2,
  ausente: 3
};

const normalizeMateriaKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const normalizeEstadoAsistencia = (registro) => {
  const estado = String(registro?.estado || '').trim().toLowerCase();
  if (estado === 'ausente' || registro?.ausente === true) return 'ausente';
  if (estado === 'afuera' || registro?.afuera === true) return 'afuera';
  if (estado === 'tarde' || registro?.tarde === true) return 'tarde';
  if (estado === 'presente') return registro?.presente === false ? 'ausente' : 'presente';
  if (estado) return estado;
  return registro?.presente === false ? 'ausente' : 'presente';
};

const getEstadoPriority = (estado) => ESTADO_PRIORITY[normalizeEstadoAsistencia({ estado })] ?? 0;

const shouldReplaceEstado = (currentEstado, nextEstado) => getEstadoPriority(nextEstado) > getEstadoPriority(currentEstado);

const buildGroupedFlags = (estado) => ({
  presente: estado === 'presente',
  tarde: estado === 'tarde',
  afuera: estado === 'afuera',
  ausente: estado === 'ausente'
});

const upsertMateriaDetalle = (group, registro, estado) => {
  const materiaId = Number(registro?.materiaId);
  const materiaNombre = String(registro?.materia?.nombre || '').trim();
  const key = Number.isInteger(materiaId) && materiaId > 0
    ? `id:${materiaId}`
    : (materiaNombre ? `name:${normalizeMateriaKey(materiaNombre)}` : 'sin-materia');
  const current = group.materiasMap.get(key);
  if (!current) {
    group.materiasMap.set(key, {
      materiaId: Number.isInteger(materiaId) && materiaId > 0 ? materiaId : null,
      materia: materiaNombre || null,
      estadoActual: estado
    });
    return;
  }
  if (shouldReplaceEstado(current.estadoActual, estado)) {
    current.estadoActual = estado;
  }
};

const sortMateriaDetalles = (left, right) => {
  const byName = String(left?.materia || '').localeCompare(String(right?.materia || ''), undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return Number(left?.materiaId || 0) - Number(right?.materiaId || 0);
};

export const aggregateAttendanceRowsByStudentDate = (registros = [], { includeMateriaDetails = false } = {}) => {
  const grouped = new Map();

  registros.forEach((registro) => {
    const estudianteId = Number(registro?.estudianteId);
    const cursoId = Number(registro?.cursoId);
    const fecha = String(registro?.fecha || '').trim();
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) return;
    if (!Number.isInteger(cursoId) || cursoId <= 0) return;
    if (!fecha) return;

    const estado = normalizeEstadoAsistencia(registro);
    const key = `${cursoId}:${estudianteId}:${fecha}`;
    const existing = grouped.get(key);

    if (!existing) {
      const entry = {
        fecha,
        cursoId,
        estudianteId,
        estado,
        ...buildGroupedFlags(estado)
      };
      if (includeMateriaDetails) entry.materiasMap = new Map();
      grouped.set(key, entry);
      if (includeMateriaDetails) upsertMateriaDetalle(entry, registro, estado);
      return;
    }

    if (shouldReplaceEstado(existing.estado, estado)) {
      existing.estado = estado;
      Object.assign(existing, buildGroupedFlags(estado));
    }
    if (includeMateriaDetails) upsertMateriaDetalle(existing, registro, estado);
  });

  return Array.from(grouped.values()).map((entry) => {
    if (!includeMateriaDetails) return entry;
    const materias = Array.from(entry.materiasMap.values()).sort(sortMateriaDetalles);
    delete entry.materiasMap;
    return {
      ...entry,
      materias
    };
  });
};
