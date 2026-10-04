import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, orderApi, paymentApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { CURRENCY, formatMoney } from '../lib/format';
import { openRazorpayCheckout, type RazorpayResponse } from '../lib/razorpay';
import type { GatewayOrder, Order, WalletSummary } from '../types';

type Method = 'wallet' | 'razorpay';

export function CheckoutPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { canteen, location, lines, clear, subtotal, tax, total, taxPercent, count } = useCart();
  const locationState = useLocation();

  const [method, setMethod] = useState<Method>('razorpay');
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [provider, setProvider] = useState<'razorpay' | 'sandbox'>('razorpay');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<{ order: Order; gateway: GatewayOrder } | null>(null);
  const note = (locationState.state as { note?: string } | null)?.note;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [config, walletResult] = await Promise.all([paymentApi.config(), paymentApi.wallet()]);
        if (!active) return;
        setProvider(config.provider);
        setWallet(walletResult.wallet);
        if (walletResult.wallet.balance >= total) setMethod('wallet');
      } catch {
        /* checkout still works with Razorpay only */
      }
    })();
    return () => {
      active = false;
    };
  }, [total]);

  if (!canteen || count === 0) {
    return (
      <div className="page__stack">
        <EmptyState icon="🛒" title="Nothing to check out" message="Your cart is empty." action={<Button onClick={() => navigate('/scan')}>Back to scan</Button>} />
      </div>
    );
  }

  const place = async (selected: Method) => {
    setBusy(true);
    setError(null);
    try {
      const created = await orderApi.create({
        canteen: canteen.id,
        qrLocationCode: location?.code ?? '',
        items: lines.map((line) => ({ menuItem: line.menuItem, quantity: line.quantity })),
        paymentMethod: selected,
        note,
      });

      if (selected === 'wallet' || !created.gateway) {
        clear();
        navigate('/order-success', { replace: true, state: { order: created.order } });
        return;
      }

      if (provider === 'sandbox') {
        setSandbox({ order: created.order, gateway: created.gateway });
        return;
      }

      const outcome = await openRazorpayCheckout(
        created.gateway,
        { name: user?.name ?? 'Student', email: user?.email ?? '', phone: user?.phone },
        (response) => void verify(created.order.id, response),
        () => setBusy(false),
      );

      if (outcome === 'unavailable') {
        setError('Razorpay checkout could not be loaded. Check your connection or try the wallet.');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed. Please try again.');
      setBusy(false);
    }
  };

  const verify = async (orderId: string, response: RazorpayResponse) => {
    try {
      const result = await paymentApi.verify({
        orderId,
        gatewayOrderId: response.razorpay_order_id,
        gatewayPaymentId: response.razorpay_payment_id,
        gatewaySignature: response.razorpay_signature,
      });
      clear();
      toast.success('Payment verified — the kitchen has your order!');
      navigate('/order-success', { replace: true, state: { order: result.order } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment verification failed.');
      setBusy(false);
    }
  };

  const runSandbox = async () => {
    if (!sandbox) return;
    setBusy(true);
    try {
      const paid = await paymentApi.sandboxCheckout(sandbox.gateway.gatewayOrderId);
      await verify(sandbox.order.id, {
        razorpay_payment_id: paid.gatewayPaymentId,
        razorpay_order_id: sandbox.gateway.gatewayOrderId,
        razorpay_signature: paid.gatewaySignature,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sandbox checkout failed.');
      setBusy(false);
    }
  };

  const walletEnough = (wallet?.balance ?? 0) >= total;

  return (
    <div className="checkout">
      <div className="checkout__main">
        <header className="page__head">
          <div>
            <h1 className="page__title">Checkout</h1>
            <p className="page__sub">
              {canteen.name} · {count} item{count > 1 ? 's' : ''}
            </p>
          </div>
        </header>

        {error && <div className="alert alert--error">{error}</div>}

        {provider === 'sandbox' && !sandbox && (
          <div className="alert alert--info">
            Razorpay keys are not configured, so this build runs the local gateway emulator. It signs real payloads and exercises the exact same server
            verification path as production Razorpay.
          </div>
        )}

        <Card title="Items">
          <ul className="checkout__items">
            {lines.map((line) => (
              <li key={line.menuItem}>
                <span>
                  {line.quantity}× {line.name}
                </span>
                <span>{formatMoney(line.price * line.quantity)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {note && (
          <Card title="Note for the kitchen">
            <p className="muted">{note}</p>
          </Card>
        )}

        {!sandbox ? (
          <Card title="Payment method">
            <div className="methods">
              <button
                type="button"
                className={`method ${method === 'razorpay' ? 'is-active' : ''}`}
                onClick={() => setMethod('razorpay')}
              >
                <span className="method__icon" aria-hidden="true">
                  💳
                </span>
                <span className="method__body">
                  <strong>{provider === 'sandbox' ? 'Card / UPI (test gateway)' : 'Razorpay'}</strong>
                  <small>
                    {provider === 'sandbox'
                      ? 'Local emulator — no real money moves'
                      : 'UPI, cards, netbanking and wallets'}
                  </small>
                </span>
              </button>

              <button
                type="button"
                className={`method ${method === 'wallet' ? 'is-active' : ''}`}
                onClick={() => setMethod('wallet')}
                disabled={!wallet}
              >
                <span className="method__icon" aria-hidden="true">
                  👛
                </span>
                <span className="method__body">
                  <strong>FoodFlow wallet</strong>
                  <small>
                    Balance {formatMoney(wallet?.balance ?? 0)}
                    {wallet && !walletEnough ? ' · not enough for this order' : ''}
                  </small>
                </span>
              </button>
            </div>

            {method === 'wallet' && !walletEnough && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/wallet')} className="checkout__topup">
                Top up wallet
              </Button>
            )}
          </Card>
        ) : (
          <Card title="Complete your payment">
            <p className="muted">
              Gateway order <code>{sandbox.gateway.gatewayOrderId}</code> for {formatMoney(sandbox.gateway.amount)}.
            </p>
            <div className="checkout__actions">
              <Button onClick={runSandbox} loading={busy}>
                Pay {formatMoney(sandbox.gateway.amount)}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await orderApi.cancel(sandbox.order.id, 'Checkout abandoned');
                    toast.push('Order cancelled — nothing was charged.', 'info');
                  } catch {
                    /* nothing to undo */
                  }
                  setSandbox(null);
                  setBusy(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}
      </div>

      <aside className="checkout__summary">
        <Card title="Order summary">
          <dl className="bill">
            <div>
              <dt>Items</dt>
              <dd>{formatMoney(subtotal)}</dd>
            </div>
            <div>
              <dt>GST ({taxPercent}%)</dt>
              <dd>{formatMoney(tax)}</dd>
            </div>
            <div className="bill__total">
              <dt>Total</dt>
              <dd>{formatMoney(total)}</dd>
            </div>
          </dl>
          {method === 'wallet' && wallet && (
            <p className="muted checkout__balance">
              Wallet after payment: {formatMoney(Math.max(0, wallet.balance - total))}
            </p>
          )}
          {!sandbox && (
            <Button full size="lg" loading={busy} disabled={!canteen.canOrder || (method === 'wallet' && !walletEnough)} onClick={() => place(method)}>
              {method === 'wallet' ? `Pay ${CURRENCY}${total.toFixed(2)} from wallet` : `Pay ${CURRENCY}${total.toFixed(2)}`}
            </Button>
          )}
          <button type="button" className="linkish checkout__back" onClick={() => navigate('/cart')}>
            Edit cart
          </button>
        </Card>
      </aside>

      {busy && !sandbox && provider === 'razorpay' && <Spinner label="Waiting for the gateway…" />}
    </div>
  );
}