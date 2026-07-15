import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";

export default async function PaymentsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">{bundle.student.name}｜繳費狀態</p>
          <h1>{bundle.billingPlan ? `${bundle.stats.installmentCount} 期付款紀錄` : "付款紀錄"}</h1>
          {bundle.billingPlan && (
            <p className="muted">
              已繳 {bundle.stats.paidInstallments} 期，未繳{" "}
              {Math.max(bundle.stats.installmentCount - bundle.stats.paidInstallments, 0)} 期
            </p>
          )}
        </div>
      </header>

      <section className="panel">
        <div className="section-heading">
          <h2>付款摘要</h2>
          {bundle.billingPlan && (
            <span className="badge">
              已繳 {bundle.stats.paidInstallments} / {bundle.stats.installmentCount}
            </span>
          )}
        </div>
        {bundle.billingPlan ? (
          <p className="muted">
            總額 {formatMoney(bundle.billingPlan.total_amount)}，每期 {formatMoney(bundle.billingPlan.amount_per_installment)}
          </p>
        ) : (
          <p className="muted empty-state">目前尚無付款方案。</p>
        )}
      </section>

      {bundle.paymentRecords.length > 0 ? (
        <section className="grid-3">
          {bundle.paymentRecords.map((record) => (
            <article className={`card payment-card ${record.status === "paid" ? "paid" : ""}`} key={record.id}>
              <div className="card-meta">
                <p className="eyebrow">第 {record.installment_no} 期</p>
                <span className={`badge ${record.status === "paid" ? "" : "unavailable"}`}>{statusLabel(record.status)}</span>
              </div>
              <p>{formatMoney(record.amount)}</p>
              <strong>
                {record.status === "paid"
                  ? `繳費日 ${formatDate(record.paid_date)}`
                  : `應繳日 ${formatDate(record.due_date)}`}
              </strong>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel">
          <p className="muted empty-state">目前尚無繳費紀錄。</p>
        </section>
      )}
    </main>
  );
}
