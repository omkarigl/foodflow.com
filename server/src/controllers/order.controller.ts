import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { Canteen, MenuItem, Order, QRLocation, type IOrder } from '../models';
import { ApiError, asyncHandler } from '../utils/ApiError';
import {
  createOrder,
  getOpenOrdersForUser,
  hydrateOrder,
  payOrderWithWallet,
  settleOrderPayment,
  transitionOrder,
} from '../services/order.service';
import type { OrderStatus } from '../constants';

const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING', 'READY'];
const POPULATE = [
  { path: 'user', select: 'name email phone studentId role' },
  { path: 'canteen', select: 'name code block isOpen prepTimeMins' },
  { path: 'qrLocation', select: 'code label block tableHint' },
  { path: 'items.menuItem', select: 'name imageUrl emoji category' },
];

export const placeOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    canteen: string;
    qrLocation?: string;
    qrLocationCode?: string;
    items: Array<{ menuItem: string; quantity: number; notes?: string }>;
    paymentMethod: 'razorpay' | 'wallet';
    note?: string;
  };

  // Frontend prices/totals are ignored entirely; the server prices from the database.
  const { order, gateway } = await createOrder({
    userId: req.user!.id,
    canteenId: body.canteen,
    qrLocationId: body.qrLocation,
    qrLocationCode: body.qrLocationCode,
    lines: body.items,
    paymentMethod: body.paymentMethod,
    note: body.note,
  });

  // Wallet checkout settles immediately: the balance is verified and debited server-side
  // before the order is ever handed to the kitchen.
  if (body.paymentMethod === 'wallet') {
    const paid = await payOrderWithWallet(String(order._id), req.user!.id);
    res.status(201).json({ order: paid, gateway: null });
    return;
  }

  const hydrated = await hydrateOrder(order._id);
  const { emitToAdmins, publishOrderEvent, SOCKET_EVENTS } = await import('../services/realtime.service');
  publishOrderEvent(SOCKET_EVENTS.ORDER_NEW, hydrated);
  emitToAdmins(SOCKET_EVENTS.QUEUE, { canteen: String(order.canteen), at: new Date().toISOString() });

  res.status(201).json({ order: hydrated, gateway });
});

export const payWithWallet = asyncHandler(async (req: Request, res: Response) => {
  const order = await payOrderWithWallet(req.params.id, req.user!.id);
  res.json({ order });
});

/** Student order history with filters and pagination. */
export const myOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
  const filter: Record<string, unknown> = { user: req.user!.id };

  if (status === 'active') filter.status = { $in: ACTIVE_STATUSES };
  else if (status && status !== 'all') filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).exec(),
    Order.countDocuments(filter),
  ]);

  res.json({
    orders: orders.map((o) => o.toJSON()),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const currentOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = await getOpenOrdersForUser(req.user!.id);
  res.json({ orders });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id).populate(POPULATE).exec();
  if (!order) throw ApiError.notFound('Order not found.');

  const userRef = order.user as unknown;
  const ownerId =
    userRef && typeof userRef === 'object' && userRef !== null && '_id' in (userRef as Record<string, unknown>)
      ? String((userRef as Record<string, unknown>)._id)
      : String(userRef);
  if (ownerId !== req.user!.id && req.user!.role !== 'admin') throw ApiError.forbidden('You do not have access to this order.');

  res.json({ order });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, note, reason } = req.body as { status: OrderStatus; note?: string; reason?: string };
  const order = await transitionOrder({
    orderId: req.params.id,
    nextStatus: status,
    actorId: req.user!.id,
    actorRole: req.user!.role,
    note,
    reason,
  });
  res.json({ order, message: `Order moved to ${status.replace(/_/g, ' ').toLowerCase()}.` });
});

/** Admin live queue. */
export const adminOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, scope, canteen, page, limit, search } = req.query as unknown as {
    status?: string;
    scope: 'mine' | 'all';
    canteen?: string;
    page: number;
    limit: number;
    search?: string;
  };

  const filter: Record<string, unknown> = {};
  if (canteen) filter.canteen = canteen;

  if (!status || status === 'active') filter.status = { $in: ACTIVE_STATUSES };
  else if (status !== 'all') filter.status = status;

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ token: rx }, { note: rx }, { 'user.name': rx }, { 'user.email': rx }, { 'user.studentId': rx }];
  }

  const [orders, total, counts] = await Promise.all([
    Order.find(filter).sort({ placedAt: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).exec(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: canteen ? { canteen } : {} }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  res.json({
    orders: orders.map((o) => o.toJSON()),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: counts.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
    scope,
  });
});

/** Compact queue view used by the live dashboard board. */
export const liveQueue = asyncHandler(async (req: Request, res: Response) => {
  const canteenId = (req.query.canteen as string) || undefined;
  const orders = await Order.find({
    ...(canteenId ? { canteen: canteenId } : {}),
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ placedAt: 1 })
    .populate(POPULATE)
    .exec();

  const columns: Record<string, HydratedDocument<IOrder>[]> = { PENDING_PAYMENT: [], PAID: [], ACCEPTED: [], PREPARING: [], READY: [] };
  for (const order of orders) {
    (columns[order.status] ??= []).push(order);
  }

  res.json({
    columns: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v.map((o) => o.toJSON())])),
    total: orders.length,
    generatedAt: new Date().toISOString(),
  });
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const reason = (req.body?.reason as string | undefined) ?? 'Cancelled by student';
  const order = await transitionOrder({
    orderId: req.params.id,
    nextStatus: 'CANCELLED',
    actorId: req.user!.id,
    actorRole: req.user!.role,
    reason,
  });
  res.json({ order, message: 'Order cancelled.' });
});

/** Lightweight "can I still buy this" check used by the student cart screen. */
export const validateCart = asyncHandler(async (req: Request, res: Response) => {
  const items = req.body?.items as Array<{ menuItem: string; quantity: number }> | undefined;
  if (!Array.isArray(items) || items.length === 0) throw ApiError.badRequest('Send at least one cart line.');

  const docs = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItem) } })
    .populate('canteen', 'name code isOpen')
    .lean({ virtuals: true });
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const lines = items.map((line) => {
    const doc = byId.get(line.menuItem);
    if (!doc) return { menuItem: line.menuItem, ok: false, reason: 'This item is no longer on the menu.', available: 0 };
    if (!doc.isAvailable) return { menuItem: line.menuItem, ok: false, reason: `${doc.name} is currently unavailable.`, available: 0 };
    const tracked = doc.trackStock && doc.stock !== null;
    if (tracked && (doc.stock as number) < line.quantity) {
      return {
        menuItem: line.menuItem,
        ok: false,
        reason: `Only ${doc.stock} portion(s) of ${doc.name} left.`,
        available: doc.stock as number,
      };
    }
    return { menuItem: line.menuItem, ok: true, available: tracked ? (doc.stock as number) : null, price: doc.price, name: doc.name };
  });

  res.json({ lines, ok: lines.every((l) => l.ok) });
});

/** Static reference data the checkout screen needs. */
export const checkoutContext = asyncHandler(async (req: Request, res: Response) => {
  const canteen = await Canteen.findById(req.query.canteen).lean();
  if (!canteen) throw ApiError.notFound('Canteen not found.');
  const qrLocation = req.query.location ? await QRLocation.findOne({ code: String(req.query.location).toUpperCase() }).lean() : null;
  const { getSettings } = await import('../services/settings.service');
  const settings = await getSettings();
  res.json({
    canteen: { ...canteen, id: String(canteen._id) },
    qrLocation: qrLocation ? { ...qrLocation, id: String(qrLocation._id) } : null,
    settings: {
      minOrderValue: settings.minOrderValue,
      taxPercent: settings.taxPercent,
      taxLabel: settings.taxLabel,
      currencySymbol: settings.currencySymbol,
      maxItemsPerOrder: settings.maxItemsPerOrder,
    },
  });
});