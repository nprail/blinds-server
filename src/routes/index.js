import { Router } from 'express';
import blindsRouter from './blinds.js';
import healthRouter from './health.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/blinds', blindsRouter);

export default router;
