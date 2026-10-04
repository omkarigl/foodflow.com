import type {
  AnalyticsReport,
  AppSettings,
  Canteen,
  DashboardStats,
  GatewayOrder,
  InventoryRow,
  InventorySummary,
  KanbanBoard,
  MenuItem,
  Order,
  OrderStatus,
  Paged,
  QRLocation,
  Role,
  User,
  WalletSummary,
  WalletTransaction,
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'foodflow.token';

export class ApiError extends Error {
  status: number;
  name: string;
  details?: unknown;

  constructor(status: number, name: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.name = name;
    this.details = details;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isPaymentError(): boolean {
    return this.name === 'INSUFFICIENT_STOCK' || this.name === 'CANTEEN_CLOSED' || this.name === 'CANTEEN_FULL';
  }
}

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  token?: string | null;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const token = options.token === undefined ? tokenStore.get() : options.token;

  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}${buildQuery(query)}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the FoodFlow server. Check your connection.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: 'The server returned an unexpected response.' } };
    }
  }

  if (!response.ok) {
    const err = (data as { error?: { name?: string; message?: string; errors?: unknown } })?.error;
    throw new ApiError(
      response.status,
      err?.name ?? 'REQUEST_FAILED',
      err?.message ?? `Request failed with status ${response.status}.`,
      err?.errors,
    );
  }

  return data as T;
}

/* ------------------------------------------------------------------ auth */
export const authApi = {
  login: (email: string, password: string, role: Role) =>
    request<{ user: User; token: string }>('/auth/login', { method: 'POST', body: { email, password, role } }),
  register: (body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    studentId?: string;
    block?: string;
  }) => request<{ user: User; token: string }>('/auth/register', { method: 'POST', body }),
  me: () => request<{ user: User }>('/auth/me'),
  updateProfile: (body: { name?: string; phone?: string; block?: string }) =>
    request<{ user: User }>('/auth/profile', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
};

/* --------------------------------------------------------------- canteen */
export const canteenApi = {
  status: () => request<{ canteens: Canteen[]; serverTime: string }>('/canteen/status'),
  categories: () => request<{ categories: string[] }>('/canteen/categories'),
  qrLocations: () => request<{ locations: QRLocation[] }>('/canteen/qr-locations'),
  resolve: (code: string) =>
    request<{ canteen: Canteen; location: QRLocation }>('/canteen/resolve', { query: { code } }),
  one: (canteenId: string) => request<{ canteen: Canteen }>(`/canteen/${canteenId}/status`),
  list: () => request<{ canteens: Canteen[] }>('/canteen'),
  create: (body: Record<string, unknown>) => request<{ canteen: Canteen }>('/canteen', { method: 'POST', body }),
  setStatus: (canteenId: string, body: { isOpen: boolean; statusReason?: string; closedMessage?: string }) =>
    request<{ canteen: Canteen }>(`/canteen/status/${canteenId}`, { method: 'PATCH', body }),
  createQrLocation: (body: Record<string, unknown>) =>
    request<{ location: QRLocation }>('/canteen/qr-locations', { method: 'POST', body }),
  updateQrLocation: (id: string, body: Record<string, unknown>) =>
    request<{ location: QRLocation }>(`/canteen/qr-locations/${id}`, { method: 'PATCH', body }),
  deleteQrLocation: (id: string) =>
    request<{ message: string }>(`/canteen/qr-locations/${id}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ menu */
export const menuApi = {
  list: (query?: Query & { canteen: string }, signal?: AbortSignal) =>
    request<{ items: MenuItem[]; categories: string[]; canteen: Canteen }>('/menu', { query, signal }),
  item: (id: string) => request<{ item: MenuItem }>(`/menu/${id}`),
  overview: (canteenId?: string) => request<Record<string, unknown>>('/menu/overview', { query: { canteen: canteenId } }),
  inventory: (query?: Query) =>
    request<{ items: InventoryRow[]; summary: InventorySummary }>('/menu/inventory', { query }),
  inventoryHistory: (id: string) => request<{ history: Array<Record<string, unknown>> }>(`/menu/${id}/inventory-history`),
  create: (body: Record<string, unknown>) => request<{ item: MenuItem }>('/menu', { method: 'POST', body }),
  update: (id: string, body: Record<string, unknown>) => request<{ item: MenuItem }>(`/menu/${id}`, { method: 'PATCH', body }),
  setAvailability: (id: string, isAvailable: boolean) =>
    request<{ item: MenuItem }>(`/menu/${id}/availability`, { method: 'PATCH', body: { isAvailable } }),
  bulkAvailability: (ids: string[], isAvailable: boolean) =>
    request<{ updated: number }>('/menu/bulk/availability', { method: 'POST', body: { itemIds: ids, isAvailable } }),
  adjustInventory: (body: { itemId: string; mode: 'set' | 'add' | 'subtract'; quantity: number; reason?: string }) =>
    request<{ item: MenuItem }>('/menu/inventory/adjust', { method: 'POST', body }),
  bulkInventory: (body: { items: Array<{ itemId: string; stock: number }> }) =>
    request<{ updated: number }>('/menu/inventory/bulk-set', { method: 'POST', body }),
  remove: (id: string) => request<{ message: string }>(`/menu/${id}`, { method: 'DELETE' }),
};

/* ---------------------------------------------------------------- orders */
export const orderApi = {
  create: (body: {
    canteen: string;
    qrLocationCode: string;
    items: Array<{ menuItem: string; quantity: number; notes?: string }>;
    paymentMethod: 'razorpay' | 'wallet';
    note?: string;
  }) => request<{ order: Order; gateway: GatewayOrder | null }>('/orders', { method: 'POST', body }),
  validateCart: (body: { canteen: string; items: Array<{ menuItem: string; quantity: number }> }) =>
    request<{ valid: boolean; issues: string[]; subtotal: number; tax: number; total: number }>('/orders/validate-cart', {
      method: 'POST',
      body,
    }),
  checkoutContext: () => request<{ settings: AppSettings; wallet: WalletSummary }>('/orders/checkout-context'),
  mine: (query?: Query) => request<Paged<Order> & { statusCounts: Record<string, number> }>('/orders/my', { query }),
  current: () => request<{ orders: Order[] }>('/orders/current'),
  one: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  cancel: (id: string, reason?: string) =>
    request<{ order: Order; refund?: { amount: number; method: string } }>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  adminList: (query?: Query) => request<Paged<Order> & { counts: Record<string, number> }>('/orders/admin', { query }),
  queue: (canteen?: string) => request<KanbanBoard>('/orders/queue', { query: { canteen } }),
  setStatus: (id: string, status: OrderStatus, note?: string) =>
    request<{ order: Order }>(`/orders/${id}/status`, { method: 'PATCH', body: { status, note } }),
};

/* --------------------------------------------------------------- payment */
export const paymentApi = {
  config: () =>
    request<{
      provider: 'razorpay' | 'sandbox';
      keyId?: string;
      currency: string;
      appName: string;
      razorpayEnabled: boolean;
      sandboxEnabled: boolean;
    }>('/payment/config'),
  createOrder: (orderId: string) => request<{ gateway: GatewayOrder; order: Order }>('/payment/create-order', { method: 'POST', body: { orderId } }),
  verify: (body: { orderId: string; gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) =>
    request<{ order: Order; alreadyApplied: boolean }>('/payment/verify', { method: 'POST', body }),
  sandboxCheckout: (gatewayOrderId: string) =>
    request<{ gatewayPaymentId: string; gatewaySignature: string; amount: number }>('/payment/sandbox/checkout', {
      method: 'POST',
      body: { gatewayOrderId },
    }),
  wallet: () => request<{ wallet: WalletSummary }>('/payment/wallet'),
  walletTransactions: (query?: Query) => request<Paged<WalletTransaction>>('/payment/wallet/transactions', { query }),
  walletTopup: (amount: number) => request<{ wallet: WalletSummary; gateway: GatewayOrder }>('/payment/wallet/topup', { method: 'POST', body: { amount } }),
  walletTopupVerify: (body: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) =>
    request<{ wallet: WalletSummary; alreadyApplied: boolean; message: string }>('/payment/wallet/topup/verify', {
      method: 'POST',
      body,
    }),
};

/* ----------------------------------------------------------------- admin */
export const adminApi = {
  dashboard: (canteen?: string) => request<DashboardStats>('/admin/dashboard', { query: { canteen } }),
  analytics: (query?: Query) => request<AnalyticsReport>('/admin/analytics', { query }),
  health: () => request<{ status: string; counts: Record<string, number>; database: string; uptimeSeconds: number }>('/admin/health'),
  users: (query?: Query) => request<Paged<User & { stats: Record<string, number>; walletBalance: number }>>('/admin/users', { query }),
  user: (id: string) => request<{ user: User & { stats: Record<string, number> } }>(`/admin/users/${id}`),
  updateUser: (id: string, body: Record<string, unknown>) => request<{ user: User }>(`/admin/users/${id}`, { method: 'PATCH', body }),
  removeUser: (id: string) => request<{ message: string }>(`/admin/users/${id}`, { method: 'DELETE' }),
  createStaff: (body: { name: string; email: string; password: string; phone?: string }) =>
    request<{ user: User }>('/admin/users/staff', { method: 'POST', body }),
  settings: () => request<{ settings: AppSettings }>('/admin/settings'),
  updateSettings: (body: Partial<AppSettings>) => request<{ settings: AppSettings }>('/admin/settings', { method: 'PATCH', body }),
  tokens: () =>
    request<{
      format: { length: number; characters: string; example: string };
      issuedToday: Array<{ token: string; orderNumber: number; canteen?: string; at: string }>;
      activeOrders: Array<{ token: string; orderNumber: number; status: OrderStatus; placedAt: string }>;
    }>('/admin/tokens'),
  syncCounters: () => request<{ message: string; counters: Record<string, number> }>('/admin/sync-counters', { method: 'POST' }),
  adjustWallet: (body: { user: string; amount: number; type: 'credit' | 'debit'; reason?: string }) =>
    request<{ wallet: WalletSummary }>('/admin/wallet/adjust', { method: 'POST', body }),
};