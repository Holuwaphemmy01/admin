export const PLATFORM_WALLET_OWNER_USERNAME = "brickpine";
export const PLATFORM_WALLET_RECENT_TRANSACTIONS_LIMIT = 20;

export interface PlatformWalletUserSummary {
  id: number;
  username: string;
}

export interface PlatformWalletBalances {
  availableBalance: number;
  ledgerBalance: number;
}

export interface PlatformCommissionSummary {
  sellerCommissionTotal: number;
  logisticsCommissionTotal: number;
  totalCommission: number;
}

export interface PlatformWalletTransactionItem {
  id: number;
  amount: number;
  currency: string;
  transactionId: string | null;
  transactionType: number | null;
  description: string | null;
  createdAt: string;
}

export interface PlatformWalletOverviewResponse {
  platformUser: PlatformWalletUserSummary;
  wallet: PlatformWalletBalances;
  commissionSummary: PlatformCommissionSummary;
  transactions: PlatformWalletTransactionItem[];
}

export interface UserWalletResponse {
  username: string;
  availableBalance: number;
  ledgerBalance: number;
  currency: string;
}

export interface ManualCreditWalletRequestBody {
  username: string;
  amount: number;
  description: string;
}

export interface ManualCreditWalletResponse {
  message: string;
  newBalance: number;
}
