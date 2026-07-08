import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";

export default async function PaymentsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">繳費狀態</p>
          <h1>6 期付款紀錄</h1>
        </div>
      </header>

      <section className="panel">
        <div className="section-heading">
          <h2>付款摘要</h2>
          <span className="badge">
            已繳 {bundle.stats.paidInstallments} / {bundle.stats.installmentCount}
          </span>
        </div>
        {bundle.billingPlan && (
          <p className="muted">
            總額 {formatMoney(bundle.billingPlan.total_amount)}，每期 {formatMoney(bundle.billingPlan.amount_per_installment)}
          </p>
        )}
      </section>

      <section className="grid-3">
        {bundle.paymentRecords.map((record) => (
          <article className="card" key={record.id}>
            <p className="eyebrow">第 {record.installment_no} 期</p>
            <h3>{statusLabel(record.status)}</h3>
            <p>{formatMoney(record.amount)}</p>
            <p className="muted">
              {record.status === "paid" ? `繳費日 ${formatDate(record.paid_date)}` : `應繳日 ${formatDate(record.due_date)}`}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
