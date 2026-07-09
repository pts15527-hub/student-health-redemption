import { formatDate } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";

export default async function RecordsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const creditUnit = bundle.packagePlan?.credit_unit_label ?? "組";

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">保健食品領取紀錄</p>
          <h1>全部紀錄</h1>
        </div>
      </header>

      <section className="panel record-list">
        {bundle.redemptionRecords.map((record) => (
          <details className="record-summary" key={record.id}>
            <summary>
              {formatDate(record.record_date)}
              <br />
              扣 {record.credit_used} {creditUnit}｜剩餘 {record.remaining_after ?? "未計算"} {creditUnit}
            </summary>
            <div className="grid">
              {record.items?.map((item) => (
                <p key={item.id}>
                  {item.item_name} × {item.quantity}
                </p>
              ))}
              {record.bonus_items?.map((item) => (
                <p key={item.id}>
                  贈品：{item.item_name} × {item.quantity}
                </p>
              ))}
              {record.notes && <p className="muted">{record.notes}</p>}
            </div>
          </details>
        ))}
        {!bundle.redemptionRecords.length && <p className="muted">尚無領取紀錄</p>}
      </section>
    </main>
  );
}
