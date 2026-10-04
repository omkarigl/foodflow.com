import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, orderApi } from '../lib/api';
import { useRealtime } from '../context/SocketContext';
import { Button, Card, EmptyState, ErrorNote, OrderToken, Skeleton, StatusBadge } from '../components/ui';
import { formatDateTime, formatMoney, timeAgo } from '../lib/format';
import { printReceipt } from '../lib/print';
import { OrderProgress } from './OrderSuccessPage';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { subscribe } = useRealtime();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof orderApi.one>>['order'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await orderApi.one(id);
      setOrder(result.order);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribe((event) => {
      if (['order:status', 'order:updated'].includes(event.type) && String((event as { order?: Order_ }).order?.id) === id) void load();
    });
    const poll = window.setInterval(() => void load(), 20000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [id, subscribe, load]);

  if (loading) return <Skeleton rows={5} />;
  if (error) return <ErrorNote message={error} onRetry={() => void load()} />;
  if (!order) return <EmptyState icon="🔍" title="Order not found" action={<Button onClick={() => navigate('/orders')}>Back to orders</Button>} />;

  return (
    <div className="page__stack page__stack--narrow">
      <header className="page__head">
        <div>
          <h1 className="page__title">Order #{order.orderNumber}</h1>
          <p className="page__sub">{formatDateTime(order.placedAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>

      <Card>
        <div className="detail-token">
          <OrderToken token={order.token} size="lg" />
          <span>Show this at the counter</span>
        </div>
        <OrderProgress order={order} />
      </Card>

      <Card title="Items">
        <ul className="checkout__items">
          {order.items.map((line) => (
            <li key={line.menuItem}>
              <span>
                {line.quantity}× {line.name}
              </span>
              <span>{formatMoney(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="bill">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotal)}</dd>
          </div>
          <div>
            <dt>GST</dt>
            <dd>{formatMoney(order.tax)}</dd>
          </div>
          <div className="bill__total">
            <dt>Total</dt>
            <dd>{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Details">
        <dl className="kv">
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
          {order.payment.gatewayPaymentId && (
            <div>
              <dt>Gateway ref</dt>
              <dd className="mono">{order.payment.gatewayPaymentId}</dd>
            </div>
          )}
          {order.note && (
            <div>
              <dt>Note</dt>
              <dd>{order.note}</dd>
            </div>
          )}
          {order.cancelReason && (
            <div>
              <dt>Cancelled because</dt>
              <dd>{order.cancelReason}</dd>
            </div>
          )}
        </dl>
      </Card>

      {order.statusHistory && order.statusHistory.length > 0 && (
        <Card title="History">
          <ol className="timeline">
            {order.statusHistory.map((entry, index) => (
              <li key={`${entry.status}-${index}`}>
                <StatusBadge status={entry.status} />
                <span>{timeAgo(entry.at)}</span>
                {entry.note && <em>{entry.note}</em>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="detail-actions">
        <Button variant="secondary" onClick={() => printReceipt(order)}>
          🖨 Print receipt
        </Button>
        <Link className="btn btn--ghost" to="/orders">
          All orders
        </Link>
      </div>
    </div>
  );
}

type Order_ = { id: string };