export type Role = 'student' | 'admin';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type PaymentMethod = 'razorpay' | 'wallet';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  studentId?: string;
  block?: string;
  avatarColor?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Canteen {
  id: string;
  name: string;
  code: string;
  description?: string;
  block?: string;
  floor?: string;
  isOpen: boolean;
  canOrder: boolean;
  closedMessage?: string;
  statusReason?: string;
  openingTime: string;
  closingTime: string;
  prepTimeMins: number;
  activeOrders: number;
  maxActiveOrders: number;
  acceptingOrders: boolean;
  waitingMinutes: number;
}

export interface QRLocation {
  id: string;
  canteen: string;
  canteenName?: string;
  code: string;
  label: string;
  block?: string;
  tableHint?: string;
  isActive: boolean;
  scanCount?: number;
}

export interface MenuItem {
  id: string;
  canteen: string;
  canteenName?: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  imageUrl?: string;
  emoji?: string;
  isVeg: boolean;
  isAvailable: boolean;
  trackStock: boolean;
  stock: number | null;
  lowStockThreshold: number;
  lowStock: boolean;
  outOfStock: boolean;
  prepTimeMins?: number;
  tags?: string[];
  popularity?: number;
}

export interface OrderItem {
  menuItem: string;
  name: string;
  emoji?: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  token: string;
  status: OrderStatus;
  user: string;
  userName?: string;
  canteen: string;
  canteenName?: string;
  canteenCode?: string;
  qrLocation: string;
  qrLocationCode?: string;
  qrLocationLabel?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  note?: string;
  cancelReason?: string;
  closeReason?: string;
  placedAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  closedAt?: string;
  payment: {
    method: PaymentMethod;
    status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
    provider?: string;
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    paidAt?: string;
    failureReason?: string;
  };
  statusHistory?: Array<{ status: OrderStatus; at: string; byRole?: string; note?: string }>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface WalletSummary {
  balance: number;
  lifetimeCredited: number;
  lifetimeDebited: number;
  transactionCount: number;
  pendingTopup?: { amount: number; gatewayOrderId: string; createdAt: string };
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  reason: string;
  description?: string;
  status: string;
  createdAt: string;
}

export interface AppSettings {
  appName: string;
  currency: string;
  taxPercent: number;
  autoAcceptOrders: boolean;
  maxActiveOrdersPerCanteen: number;
  orderTimeoutMins: number;
  lowStockThreshold: number;
  allowWalletPayments: boolean;
  supportEmail?: string;
}

export interface DashboardStats {
  today: { orders: number; revenue: number; completed: number; cancelled: number; avgOrderValue: number };
  yesterday: { orders: number; revenue: number };
  activeOrders: number;
  lowStockCount: number;
  pendingCount: number;
  revenueGrowthPercent: number;
  orderGrowthPercent: number;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  recentOrders: Order[];
  hourly: Array<{ hour: number; orders: number }>;
}

export interface AnalyticsReport {
  range: { days: number; from: string; to: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalCancelled: number;
    avgOrderValue: number;
    firstHalfRevenue: number;
    secondHalfRevenue: number;
    growthPercent: number;
  };
  daily: Array<{ date: string; orders: number; revenue: number; completed: number; cancelled: number }>;
  hourly: Array<{ hour: number; orders: number; revenue: number }>;
  byCategory: Array<{ category: string; orders: number; quantity: number; revenue: number }>;
  byCanteen: Array<{ canteen: string; orders: number; revenue: number }>;
  byPaymentMethod: Array<{ method: string; orders: number; amount: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
}

export interface InventoryRow extends MenuItem {
  stockValue: number;
}

export interface InventorySummary {
  total: number;
  tracked: number;
  outOfStock: number;
  lowStock: number;
  unavailable: number;
  stockValue: number;
}

export interface KanbanBoard {
  columns: Array<{ status: OrderStatus; label: string; orders: Order[]; count: number }>;
  total: number;
}

export interface GatewayOrder {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  provider: 'razorpay' | 'sandbox';
  keyId?: string;
  displayAmount?: number;
}