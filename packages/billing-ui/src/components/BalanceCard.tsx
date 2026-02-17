import type { BalanceInfo } from "../types";

interface Props {
  balance: BalanceInfo;
}

export function BalanceCard({ balance }: Props) {
  return (
    <div className="card stat-card">
      <div className="card-body">
        <div className={`stat-value ${balance.balance > 0 ? "text-success" : "text-danger"}`}>
          {Number(balance.balance).toFixed(2)} {balance.currency}
        </div>
        <div className="stat-label">Solde</div>
        {balance.billingExempt && (
          <span className="badge bg-warning text-dark mt-1">Exempt</span>
        )}
      </div>
    </div>
  );
}
