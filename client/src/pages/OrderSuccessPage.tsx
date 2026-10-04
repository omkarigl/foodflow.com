import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { orderApi } from '../lib/api';
import { useRealtime } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, OrderToken, StatusBadge } from '../components/ui';
import { CURRENCY, formatMoney, formatTime, timeAgo } from '../lib/format';
import { printReceipt } from '../lib/print';
import type { Order } from '../types';

export function OrderSuccessPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { subscribe } = useRealtime();
  const location = useLocation();
  const initial = (location.state as { order?: Order } | null)?.order ?? null;

  const [order, setOrder] = useState<Order | null>(initial);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!order?.id) {
      navigate('/orders', { replace: true });
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const result = await orderApi.one(order.id);
        if (active) setOrder(result.order);
      } catch {
        /* keep the last known state */
      }
    };

    const unsubscribe = subscribe((event) => {
      if (event.type !== 'order:status' || !('order' in event)) return;
      const next = event.order;
      if (String(next?.id) === order.id) setOrder(next);
    });

    pollRef.current = window.setInterval(load, 10000);
    return () => {
      active = false;
      unsubscribe();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [order?.id, subscribe, navigate]);

  if (!order) {
    return (
      <div className="page__stack">
        <EmptyState icon="🧾" title="No order selected" action={<Button onClick={() => navigate('/orders')}>My orders</Button>} />
      </div>
    );
  }

  const pending = order.status === 'PENDING_PAYMENT';

  return (
    <div className="page__stack page__stack--narrow">
      <div className={`success ${pending ? 'success--pending' : ''}`}>
        <div className="success__icon" aria-hidden="true">
          {pending ? '⏳' : '🎉'}
        </div>
        <h1 className="success__title">{pending ? 'Waiting for payment' : 'Order placed!'}</h1>
        <p className="success__sub">
          {pending
            ? 'Complete the payment to send this order to the kitchen.'
            : 'The kitchen has your order. Keep this token handy.'}
        </p>
        <div className="success__token">
          <span>Your pickup token</span>
          <OrderToken token={order.token} size="lg" />
        </div>
        <div className="success__meta">
          <span>#{order.orderNumber}</span>
          <StatusBadge status={order.status} />
          <span>{timeAgo(order.placedAt)}</span>
        </div>
      </div>

      <Card title="Where your order is" subtitle="Updates arrive live, with polling as backup.">
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

      <div className="success__actions">
        <Button variant="secondary" onClick={() => printReceipt(order)}>
          🖨 Print receipt
        </Button>
        <Button variant="ghost" onClick={() => navigate('/orders')}>
          View all orders
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            toast.success('Back to the menu!');
            navigate('/order');
          }}
        >
          Order more
        </Button>
      </div>
    </div>
  );
}

const STEPS = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

export function OrderProgress({ order }: { order: Order }) {
  if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
    return (
      <div className="progress progress--stopped">
        <p className="alert alert--error">
          This order was {order.status.toLowerCase()}. {order.cancelReason ?? order.closeReason ?? ''}
        </p>
      </div>
    );
  }

  const current = STEPS.indexOf(order.status);

  return (
    <ol className="progress">
      {STEPS.map((step, index) => {
        const done = index <= current;
        const stamps: Record<string, string | undefined> = {
          PAID: order.placedAt,
          ACCEPTED: order.acceptedAt,
          PREPARING: order.preparingAt,
          READY: order.readyAt,
          COMPLETED: order.completedAt,
        };
        return (
          <li key={step} className={`progress__step ${done ? 'is-done' : ''} ${index === current ? 'is-current' : ''}`}>
            <span className="progress__dot" aria-hidden="true">
              {done ? '✓' : index + 1}
            </span>
            <span className="progress__label">{step[0] + step.slice(1).toLowerCase()}</span>
            {done && stamps[step] && <small>{formatTime(stamps[step])}</small>}
          </li>
        );
      })}
    </ol>
  );
}

export function receiptTotals(order: Order): string {
  return `Subtotal ${CURRENCY}${order.subtotal.toFixed(2)} · GST ${CURRENCY}${order.tax.toFixed(2)} · Total ${CURRENCY}${order.total.toFixed(2)}`;
}