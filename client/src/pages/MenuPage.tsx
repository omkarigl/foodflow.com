import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { canteenApi, menuApi } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useRealtime } from '../context/SocketContext';
import { Badge, Button, Card, EmptyState, ErrorNote, Skeleton } from '../components/ui';
import { CURRENCY } from '../lib/format';
import type { MenuItem } from '../types';

type SortKey = 'popular' | 'price-asc' | 'price-desc' | 'name';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'popular', label: 'Popular' },
  { key: 'price-asc', label: 'Cheapest' },
  { key: 'price-desc', label: 'Priciest' },
  { key: 'name', label: 'A–Z' },
];

export function MenuPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { subscribe } = useRealtime();
  const { canteen, location, menu, lines, add, toggle, enter, refreshMenu, loadingMenu, menuError } = useCart();

  const code = params.get('location') ?? '';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>('popular');
  const [initialising, setInitialising] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (code && canteen?.id) {
        setInitialising(false);
        return;
      }
      try {
        const resolved = await canteenApi.resolve(code || 'PILLAR_01');
        if (!active) return;
        enter(resolved.canteen, resolved.location, []);
        const loaded = await menuApi.list({ canteen: resolved.canteen.id, includeUnavailable: 'true' });
        if (!active) return;
        enter(resolved.canteen, resolved.location, loaded.items);
        setCategories(loaded.categories);
      } catch (err) {
        if (active) console.warn('menu init failed', err);
      } finally {
        if (active) setInitialising(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Live availability updates from the kitchen.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'menu:updated' || event.type === 'inventory:updated') void refreshMenu();
    });
    return unsubscribe;
  }, [subscribe, refreshMenu]);

  const quantityOf = (id: string) => lines.find((line) => line.menuItem === id)?.quantity ?? 0;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = menu.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (vegOnly && !item.isVeg) return false;
      if (availableOnly && (!item.isAvailable || item.outOfStock)) return false;
      if (term && !`${item.name} ${item.description ?? ''} ${item.category}`.toLowerCase().includes(term)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return (b.popularity ?? 0) - (a.popularity ?? 0);
    });
  }, [menu, search, category, vegOnly, availableOnly, sort]);

  if (initialising) {
    return (
      <div className="page__stack">
        <Skeleton rows={5} />
      </div>
    );
  }

  if (!canteen) {
    return (
      <div className="page__stack">
        <EmptyState
          icon="📷"
          title="Scan a QR code to start"
          message="Every canteen has its own code on the tables and counters."
          action={<Button onClick={() => navigate('/scan')}>Go to scanner</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page__stack">
      <header className="page__head">
        <div>
          <h1 className="page__title">{canteen.name}</h1>
          <p className="page__sub">
            {canteen.description ?? canteen.code}
            {location ? ` · ${location.label}` : ''} · {canteen.prepTimeMins} min prep
          </p>
        </div>
        <Badge tone={canteen.canOrder ? 'emerald' : 'rose'}>{canteen.canOrder ? 'Taking orders' : canteen.closedMessage ?? 'Closed'}</Badge>
      </header>

      {menuError && <ErrorNote message={menuError} onRetry={() => void refreshMenu()} />}

      {!canteen.canOrder && (
        <div className="alert alert--warn">
          {canteen.closedMessage ?? 'This canteen is not accepting orders right now. Your cart is safe.'}
        </div>
      )}

      <Card padded={false}>
        <div className="filters">
          <input className="input filters__search" placeholder="Search biryani, dosa, chai…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search menu" />
          <select className="input select filters__sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort menu">
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="chips">
          <button type="button" className={`chip ${category === 'all' ? 'is-active' : ''}`} onClick={() => setCategory('all')}>
            All
          </button>
          {categories.map((name) => (
            <button key={name} type="button" className={`chip ${category === name ? 'is-active' : ''}`} onClick={() => setCategory(name)}>
              {name}
            </button>
          ))}
          <button type="button" className={`chip chip--veg ${vegOnly ? 'is-active' : ''}`} onClick={() => setVegOnly((v) => !v)}>
            🟢 Veg only
          </button>
          <button type="button" className={`chip ${availableOnly ? 'is-active' : ''}`} onClick={() => setAvailableOnly((v) => !v)}>
            Hide sold out
          </button>
        </div>
      </Card>

      {loadingMenu && <Skeleton rows={3} />}

      {!loadingMenu && visible.length === 0 && (
        <EmptyState icon="🔍" title="Nothing matches that" message="Try a different search or clear the filters." />
      )}

      <div className="menu-grid">
        {visible.map((item) => (
          <MenuCard key={item.id} item={item} quantity={quantityOf(item.id)} onAdd={() => add(item)} onRemove={() => toggle(item)} disabled={!canteen.canOrder} />
        ))}
      </div>

      {code && (
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setParams({});
            navigate('/scan');
          }}
        >
          Switch to a different canteen
        </button>
      )}
    </div>
  );
}

function MenuCard({
  item,
  quantity,
  onAdd,
  onRemove,
  disabled,
}: {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const soldOut = !item.isAvailable || item.outOfStock;
  const low = item.lowStock && !soldOut;

  return (
    <article className={`menu-card ${soldOut ? 'is-soldout' : ''}`}>
      <div className="menu-card__media">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">{item.emoji ?? '🍽️'}</span>}
        {soldOut && <span className="menu-card__soldout">Sold out</span>}
      </div>

      <div className="menu-card__body">
        <div className="menu-card__head">
          <h3 className="menu-card__name">
            {item.isVeg && <span className="veg-dot" aria-label="Vegetarian" />}
            {item.name}
          </h3>
          <span className="menu-card__price">
            {CURRENCY}
            {item.price}
          </span>
        </div>
        {item.description && <p className="menu-card__desc">{item.description}</p>}
        <div className="menu-card__meta">
          <span className="muted">{item.category}</span>
          {item.trackStock && !soldOut && (
            <span className={low ? 'stock stock--low' : 'stock'}>
              {item.stock} left{low ? ' · running low' : ''}
            </span>
          )}
          {item.trackStock && soldOut && <span className="stock stock--out">0 left</span>}
        </div>
      </div>

      <div className="menu-card__foot">
        {quantity === 0 ? (
          <Button size="sm" variant={soldOut ? 'secondary' : 'primary'} disabled={soldOut || disabled} onClick={onAdd} full>
            {soldOut ? 'Unavailable' : 'Add'}
          </Button>
        ) : (
          <div className="stepper">
            <button type="button" onClick={onRemove} aria-label={`Remove one ${item.name}`}>
              −
            </button>
            <span>{quantity}</span>
            <button type="button" onClick={onAdd} aria-label={`Add one ${item.name}`} disabled={disabled || (item.trackStock && quantity >= (item.stock ?? 0))}>
              +
            </button>
          </div>
        )}
      </div>
      {item.prepTimeMins ? <span className="menu-card__time">~{item.prepTimeMins} min</span> : null}
    </article>
  );
}