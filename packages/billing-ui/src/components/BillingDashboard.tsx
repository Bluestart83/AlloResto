import { useEffect, useState } from "react";
import type { BillingApi, BalanceInfo, Transaction } from "../types";
import { BalanceCard } from "./BalanceCard";
import { TransactionList } from "./TransactionList";
import { AutoRechargeForm } from "./AutoRechargeForm";
import { RechargePanel } from "./RechargePanel";

interface Props {
  api: BillingApi;
  stripePublishableKey: string;
  currency: string;
}

export function BillingDashboard({ api, stripePublishableKey, currency }: Props) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [b, t] = await Promise.all([
        api.getBalance(),
        api.getTransactions(),
      ]);
      setBalance(b);
      setTransactions(t);
    } catch (err) {
      console.error("billing refresh error", err);
    } finally {
      setLoading(false);
    }
  }

  // Poll until balance changes (webhook processed)
  async function waitForBalanceUpdate() {
    const before = balance?.balance;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const b = await api.getBalance();
      const t = await api.getTransactions();
      setBalance(b);
      setTransactions(t);
      if (b.balance !== before) return;
    }
  }

  useEffect(() => { refresh(); }, []);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border" /></div>;
  }

  return (
    <div className="row g-4">
      {/* Balance */}
      <div className="col-12">
        {balance && <BalanceCard balance={balance} />}
      </div>

      {/* Recharge + cards */}
      <div className="col-12">
        <RechargePanel
          api={api}
          stripePublishableKey={stripePublishableKey}
          currency={currency}
          onBalanceChange={waitForBalanceUpdate}
        />
      </div>

      {/* Auto-recharge */}
      {balance && !balance.billingExempt && (
        <div className="col-lg-6">
          <AutoRechargeForm
            api={api}
            currency={currency}
            initial={{
              enabled: false,
              threshold: 5,
              amount: 25,
            }}
            onUpdate={refresh}
          />
        </div>
      )}

      {/* Transactions */}
      <div className="col-12">
        <TransactionList transactions={transactions} />
      </div>
    </div>
  );
}
