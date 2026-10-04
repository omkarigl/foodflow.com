import { Router } from 'express';
import authRoutes from './auth.routes';
import canteenRoutes from './canteen.routes';
import menuRoutes from './menu.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';
import adminRoutes from './admin.routes';
import { isDatabaseConnected } from '../config/database';
import { paymentRuntimeInfo } from '../services/payment.service';
import { getSettings } from '../services/settings.service';
import { config } from '../config/env';

const router = Router();

router.get('/health', async (_req, res) => {
  const settings = await getSettings();
  res.json({
    status: 'ok',
    app: settings.appName,
    environment: config.nodeEnv,
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    payment: paymentRuntimeInfo(),
    serverTime: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/canteen', canteenRoutes);
router.use('/menu', menuRoutes);
router.use('/orders', orderRoutes);
router.use('/payment', paymentRoutes);
router.use('/admin', adminRoutes);

export default router;