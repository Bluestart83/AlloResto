import type { Transaction } from "../types";

interface Props {
  transactions: Transaction[];
}

export function TransactionList({ transactions }: Props) {
  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span>Transactions</span>
        <small className="text-muted">{transactions.length} entrees</small>
      </div>
      <table className="table table-sm mb-0">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Montant</th>
            <th>Solde apres</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.createdAt).toLocaleString()}</td>
              <td>
                <span className={`badge ${t.type === "credit" ? "bg-success" : t.type === "debit" ? "bg-danger" : "bg-warning"}`}>
                  {t.type}
                </span>
              </td>
              <td className={t.amount > 0 ? "text-success" : "text-danger"}>
                {t.amount > 0 ? "+" : ""}{Number(t.amount).toFixed(2)} {t.currency}
              </td>
              <td>{Number(t.balanceAfter).toFixed(2)} {t.currency}</td>
              <td>{t.description}</td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted py-4">Aucune transaction</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
