/**
 * Shared billing types for @corallo/billing-ui SDK.
 */

export interface BillingApi {
  getBalance(): Promise<BalanceInfo>;
  getTransactions(): Promise<Transaction[]>;
  recharge(amount: number, currency: string): Promise<{ clientSecret: string; paymentIntentId: string }>;
  setupCard(): Promise<{ clientSecret: string }>;
  listPaymentMethods(): Promise<PaymentMethodEntry[]>;
  deletePaymentMethod(id: string): Promise<boolean>;
  updateAutoRecharge(config: { enabled: boolean; threshold?: number; amount?: number }): Promise<AutoRechargeResult>;
  adjustment(amount: number, description: string): Promise<void>;
}

export interface BalanceInfo {
  balance: number;
  currency: string;
  billingExempt: boolean;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface PaymentMethodEntry {
  id: string;
  last4: string;
  brand: string;
  isDefault: boolean;
}

export interface AutoRechargeResult {
  autoRechargeEnabled: boolean;
  autoRechargeThreshold: number;
  autoRechargeAmount: number;
  recharged: boolean;
}
