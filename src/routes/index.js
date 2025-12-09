// Enrutador principal que agrupa subrutas.
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import asistRoutes from './asistencias.routes.js';
import reportRoutes from './reportes.routes.js';
import crudRoutes from './crud.routes.js';

const router = Router();
router.use('/auth', authRoutes);
router.use('/asistencias', asistRoutes);
router.use('/reportes', reportRoutes);
router.use('/', crudRoutes);

export default router;
