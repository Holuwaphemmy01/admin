export const DEFAULT_ADMIN_TRANSACTIONS_PAGE = 1;
export const DEFAULT_ADMIN_TRANSACTIONS_LIMIT = 20;
export const MAX_ADMIN_TRANSACTIONS_LIMIT = 100;
export const ADMIN_TRANSACTION_TYPES = ["credit", "debit"] as const;

export type AdminTransactionType = (typeof ADMIN_TRANSACTION_TYPES)[number];

export interface AdminTransactionsListFilters {
  userId?: number;
  transactionType?: AdminTransactionType;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface AdminTransactionItem {
  id: number;
  userId: number;
  amount: number;
  currency: string;
  transactionId: string | null;
  transactionType: AdminTransactionType;
  description: string | null;
  status: number;
  createdAt: string;
}

export interface AdminTransactionsListResponse {
  transactions: AdminTransactionItem[];
  total: number;
}

export interface AdminTransactionDetailsResponse {
  id: number;
  userId: number;
  amount: number;
  currency: string;
  transactionId: string;
  settlementId: number | null;
  refundId: number | null;
  transactionType: AdminTransactionType;
  description: string | null;
  ledgerBalance: number;
  availableBalance: number;
  status: number;
  createdAt: string;
}
