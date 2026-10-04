import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, orderApi } from '../lib/api';
import { useRealtime } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, ErrorNote, OrderRow, OrderToken, Skeleton, StatusBadge } from '../components/ui';
import { formatDate, formatMoney, timeAgo } from '../lib/format';
import { printReceipt } from '../lib/print';
import { OrderProgress } from './OrderSuccessPage';
import type { Order, OrderStatus } from '../types';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export function MyOrdersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { connected, subscribe } = useRealtime();
  const [filter, setFilter] = useState('active');
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const result = await orderApi.mine({ status: filter, limit: 30 });
        setOrders(result.items);
        setCounts(result.statusCounts ?? {});
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load your orders.');
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (['order:new', 'order:status', 'order:updated'].includes(event.type)) void load(true);
    });
    const poll = window.setInterval(() => void load(true), connected ? 45000 : 15000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [subscribe, connected, load]);

  const cancel = async (order: Order) => {
    setBusyId(order.id);
    try {
      const result = await orderApi.cancel(order.id, 'Cancelled by student');
      setOrders((current) => current.map((item) => (item.id === order.id ? result.order : item)));
      toast.success(result.refund ? `Cancelled · ${formatMoney(result.refund.amount)} refunded` : 'Order cancelled.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel this order.');
    } finally {
      setBusyId(null);
    }
  };

  const active = useMemo(() => orders.filter((order) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status)), [orders]);

  return (
    <div className="page__stack">
      <header className="page__head">
        <div>
          <h1 className="page__title">My orders</h1>
          <p className="page__sub">
            {active.length > 0 ? `${active.length} order${active.length > 1 ? 's' : ''} in progress` : 'Nothing cooking right now'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/scan')}>
          New order
        </Button>
      </header>

      <div className="chips">
        {FILTERS.map((option) => (
          <button key={option.key} type="button" className={`chip ${filter === option.key ? 'is-active' : ''}`} onClick={() => setFilter(option.key)}>
            {option.label}
            {counts[option.key] !== undefined && <em> {counts[option.key]}</em>}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}
      {loading && <Skeleton rows={4} />}

      {!loading && orders.length === 0 && (
        <EmptyState
          icon="🧾"
          title="No orders here"
          message="Once you place an order it will show up with live status updates."
          action={<Button onClick={() => navigate('/scan')}>Scan a canteen QR</Button>}
        />
      )}

      <div className="order-list">
        {orders.map((order) => {
          const cancellable = order.status === 'PENDING_PAYMENT' || order.status === 'PAID' || order.status === 'ACCEPTED' || order.status === 'PREPARING';
          const isOpen = expanded === order.id;
          return (
            <div key={order.id} className="order-card">
              <OrderRow order={order}>
                <div className="order-card__side">
                  <strong className="order-card__total">{formatMoney(order.total)}</strong>
                  <small>{timeAgo(order.placedAt)}</small>
                </div>
              </OrderRow>

              <div className="order-card__progress">
                <OrderProgress order={order} />
              </div>

              <div className="order-card__actions">
                <button type="button" className="linkish" onClick={() => setExpanded(isOpen ? null : order.id)}>
                  {isOpen ? 'Hide details' : 'Details'}
                </button>
                <button type="button" className="linkish" onClick={() => printReceipt(order)}>
                  🖨 Receipt
                </button>
                <Link className="linkish" to={`/orders/${order.id}`}>
                  Open
                </Link>
                {cancellable && (
                  <button type="button" className="linkish linkish--danger" disabled={busyId === order.id} onClick={() => cancel(order)}>
                    Cancel
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="order-card__detail">
                  <dl className="kv">
                    <div>
                      <dt>Order number</dt>
                      <dd>#{order.orderNumber}</dd>
                    </div>
                    <div>
                      <dt>Placed</dt>
                      <dd>{formatDate(order.placedAt)}</dd>
                    </div>
                    <div>
                      <dt>Canteen</dt>
                      <dd>{order.canteenName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>
                        {order.qrLocationLabel ?? '—'} {order.qrLocationCode ? `(${order.qrLocationCode})` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Payment</dt>
                      <dd>
                        {order.payment.method} · {order.payment.status}
                      </dd>
                    </div>
                    <div>
                      <dt>Token</dt>
                      <dd>
                        <OrderToken token={order.token} size="sm" />
                      </dd>
                    </div>
                  </dl>
                  {order.note && <p className="muted">Note: {order.note}</p>}
                  {order.cancelReason && <p className="alert alert--error">{order.cancelReason}</p>}
                  {order.statusHistory && order.statusHistory.length > 0 && (
                    <ol className="timeline">
                      {order.statusHistory.map((entry, index) => (
                        <li key={`${entry.status}-${index}`}>
                          <StatusBadge status={entry.status as OrderStatus} />
                          <span>{timeAgo(entry.at)}</span>
                          {entry.note && <em>{entry.note}</em>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card title="Pickup tip">
        <p className="muted">
          Show your token at the counter. Orders move through Accepted → Preparing → Ready, and you will see each step here the moment the kitchen
          updates it.
        </p>
      </Card>
    </div>
  );
}