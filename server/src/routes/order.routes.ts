import { Router } from 'express';
import { requireAdmin, requireAuth, requireStudent } from '../middleware/auth';
import { validate, validateAll } from '../middleware/validate';
import { createOrderSchema, idParamSchema, orderQuerySchema, updateStatusSchema } from '../validation/schemas';
import { writeLimiter } from '../middleware/rateLimit';
import {
  adminOrders,
  cancelOrder,
  checkoutContext,
  currentOrders,
  getOrder,
  liveQueue,
  myOrders,
  payWithWallet,
  placeOrder,
  updateStatus,
  validateCart,
} from '../controllers/order.controller';

const router = Router();

/* ------------------------------------------------------------- student */
router.post('/', requireAuth, requireStudent, writeLimiter, validate(createOrderSchema), placeOrder);
router.get('/my', requireAuth, myOrders);
router.get('/current', requireAuth, currentOrders);
router.post('/validate-cart', requireAuth, validateCart);
router.get('/checkout-context', requireAuth, checkoutContext);

/* ----------------------------------------------- admin queue (no clash) */
router.get('/admin', requireAuth, requireAdmin, validate(orderQuerySchema, 'query'), adminOrders);
router.get('/queue', requireAuth, requireAdmin, liveQueue);

/* -------------------------------------------------------------- shared */
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), getOrder);
router.patch('/:id/status', requireAuth, validateAll({ params: idParamSchema, body: updateStatusSchema }), updateStatus);
router.post('/:id/cancel', requireAuth, cancelOrder);
router.post('/:id/pay-with-wallet', requireAuth, requireStudent, payWithWallet);

export default router;