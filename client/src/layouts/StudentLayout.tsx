import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useRealtime } from '../context/SocketContext';
import { orderApi } from '../lib/api';
import { CURRENCY } from '../lib/format';

const NAV = [
  { to: '/scan', label: 'Scan', icon: '📷' },
  { to: '/order', label: 'Menu', icon: '🍛' },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/wallet', label: 'Wallet', icon: '👛' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function StudentLayout() {
  const { user, logout } = useAuth();
  const { count, total } = useCart();
  const { connected, subscribe } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeOrders, setActiveOrders] = useState(0);

  // Live order count with a polling fallback so the badge is never stale offline.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await orderApi.current();
        if (active) setActiveOrders(result.orders.length);
      } catch {
        /* keep the last known count */
      }
    };
    load();
    const poll = window.setInterval(load, connected ? 30000 : 12000);
    const unsubscribe = subscribe((event) => {
      if (event.type === 'order:new' || event.type === 'order:status' || event.type === 'order:updated') load();
    });
    return () => {
      active = false;
      window.clearInterval(poll);
      unsubscribe();
    };
  }, [connected, subscribe]);

  const isCartPage = location.pathname === '/cart' || location.pathname === '/checkout';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="topbar__brand" onClick={() => navigate('/scan')}>
          <span className="topbar__logo" aria-hidden="true">
            🍽️
          </span>
          <span className="topbar__name">FoodFlow</span>
        </button>

        <nav className="topbar__nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `topbar__link ${isActive ? 'is-active' : ''}`}>
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar__right">
          <span className={`conn conn--${connected ? 'on' : 'off'}`} title={connected ? 'Live updates connected' : 'Reconnecting — polling every few seconds'}>
            <span className="conn__dot" aria-hidden="true" />
            {connected ? 'Live' : 'Offline'}
          </span>
          <span className="topbar__user">{user?.name?.split(' ')[0]}</span>
        </div>
      </header>

      <main className={`page ${isCartPage ? 'page--with-cart' : ''}`}>
        <Outlet />
      </main>

      {!isCartPage && count > 0 && (
        <button type="button" className="cart-fab" onClick={() => navigate('/cart')}>
          <span className="cart-fab__count">{count}</span>
          <span>View cart</span>
          <strong>
            {CURRENCY}
            {total.toFixed(2)}
          </strong>
        </button>
      )}

      {activeOrders > 0 && !isCartPage && (
        <button type="button" className="active-fab" onClick={() => navigate('/orders')}>
          {activeOrders} active order{activeOrders > 1 ? 's' : ''}
        </button>
      )}

      <nav className="tabbar" aria-label="Mobile navigation">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `tabbar__link ${isActive ? 'is-active' : ''}`}>
            <span className="tabbar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="tabbar__label">{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="tabbar__link" onClick={() => logout()}>
          <span className="tabbar__icon" aria-hidden="true">
            🚪
          </span>
          <span className="tabbar__label">Exit</span>
        </button>
      </nav>
    </div>
  );
}