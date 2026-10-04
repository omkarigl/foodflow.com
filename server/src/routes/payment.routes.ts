import { Router } from 'express';
import { requireAdmin, requireAuth, requireStudent } from '../middleware/auth';
import { validate, validateAll } from '../middleware/validate';
import {
  createPaymentOrderSchema,
  idParamSchema,
  verifyPaymentSchema,
  walletTopupSchema,
  walletTopupVerifySchema,
} from '../validation/schemas';
import { writeLimiter } from '../middleware/rateLimit';
import {
  createPaymentOrder,
  getConfig,
  getWallet,
  listWalletTransactions,
  sandboxCheckout,
  sandboxVerifyOnly,
  verifyPayment,
  verifyWalletTopup,
  walletTopup,
} from '../controllers/payment.controller';

const router = Router();

/* --------------------------------------------------------- configuration */
router.get('/config', getConfig);

/* -------------------------------------------------------------- checkout */
router.post('/create-order', requireAuth, requireStudent, writeLimiter, validate(createPaymentOrderSchema), createPaymentOrder);
router.post('/verify', requireAuth, requireStudent, writeLimiter, validate(verifyPaymentSchema), verifyPayment);

/* -------------------------------------------------- sandbox gateway (dev) */
router.post('/sandbox/checkout', requireAuth, sandboxCheckout);
router.post('/sandbox/verify', requireAuth, sandboxVerifyOnly);

/* ---------------------------------------------------------------- wallet */
router.get('/wallet', requireAuth, getWallet);
router.get('/wallet/transactions', requireAuth, listWalletTransactions);
router.post('/wallet/topup', requireAuth, requireStudent, writeLimiter, validate(walletTopupSchema), walletTopup);
router.post('/wallet/topup/verify', requireAuth, requireStudent, writeLimiter, validate(walletTopupVerifySchema), verifyWalletTopup);

export default router;