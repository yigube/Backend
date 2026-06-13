const serviceStartedAt = Date.now();

const initialCounters = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  asistenciaRegistradaTotal: 0,
  asistenciaDuplicadaTotal: 0,
  asistenciaIdempotentReplayTotal: 0,
  syncErrorsTotal: 0
};

const counters = { ...initialCounters };

export function recordMetric(name, value = 1) {
  if (!Object.prototype.hasOwnProperty.call(counters, name)) counters[name] = 0;
  counters[name] += value;
}

export function resetMetrics() {
  Object.keys(counters).forEach((key) => {
    delete counters[key];
  });
  Object.assign(counters, initialCounters);
}

export function getMetricsSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - serviceStartedAt) / 1000),
    counters: { ...counters }
  };
}

export function writeStructuredLog(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test') return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'asistencia-backend',
    ...meta
  };
  console.log(JSON.stringify(entry));
}

export function requestMetricsMiddleware(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    recordMetric('httpRequestsTotal');
    if (res.statusCode >= 500) recordMetric('httpErrorsTotal');
    writeStructuredLog('info', 'http_request', {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id || null,
      role: req.user?.rol || null,
      schoolId: req.user?.schoolId || null
    });
  });
  next();
}

export async function getDatabaseHealth(sequelize) {
  try {
    await sequelize.authenticate();
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}
