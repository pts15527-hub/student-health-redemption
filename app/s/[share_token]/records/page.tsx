import { formatDate } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";
import type { RedemptionRecord } from "@/types/domain";

type UnrealizedProgressItem = {
  id: string;
  recordDate: string;
  planNote: string;
  receivedNote: string;
  itemName: string;
  remainingText: string;
};

const promoPlanText = "D*3＋R*3 送美妍賦活飲15盒＋12入賦活飲＋禮盒2盒";

function displayRecordNote(note: string | null, sourceType: string | null) {
  const trimmed = note?.trim();
  if (!trimmed) return null;

  const firstLine = trimmed.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (sourceType === "bundle" && firstLine) {
    const match = firstLine.match(/^【(.+?)】(.+)$/);
    if (match) {
      return `${match[1]}｜${promoPlanText}`;
    }
  }

  return trimmed;
}

function getUnrealizedProgress(records: RedemptionRecord[]): UnrealizedProgressItem[] {
  return records.flatMap((record) => {
    const note = record.notes ?? "";
    const isInitialPromo = note.includes("D*3") && note.includes("R*3") && note.includes("B群為5盒一組");

    if (!isInitialPromo) return [];

    return [
      {
        id: `${record.id}-d-r`,
        recordDate: record.record_date,
        planNote: `專案優惠｜${promoPlanText}`,
        receivedNote: "已領 D 2 盒、R 2 盒",
        itemName: "青春源汰淨 / 青春源煥活",
        remainingText: "各剩 1 盒未領",
      },
      {
        id: `${record.id}-gift-box`,
        recordDate: record.record_date,
        planNote: `專案優惠｜${promoPlanText}`,
        receivedNote: "尚未領取",
        itemName: "美妍賦活飲15盒＋12入賦活飲＋禮盒2盒",
        remainingText: "全數未領",
      },
      {
        id: `${record.id}-b-complex`,
        recordDate: record.record_date,
        planNote: "活力 BB EX｜5盒一組",
        receivedNote: "已扣 1 組，已領 1 盒",
        itemName: "活力 BB EX",
        remainingText: "剩 4 盒未領",
      },
    ];
  });
}

export default async function RecordsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const creditUnit = bundle.packagePlan?.credit_unit_label ?? "組";
  const unrealizedProgress = getUnrealizedProgress(bundle.redemptionRecords);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">保健食品領取紀錄</p>
          <h1>全部紀錄</h1>
          <p className="muted">
            已扣 {bundle.stats.usedCredits} {creditUnit}，剩餘 {bundle.stats.remainingCredits} {creditUnit}
          </p>
        </div>
      </header>

      <section className="panel record-list">
        {bundle.redemptionRecords.map((record) => {
          const note = displayRecordNote(record.notes, record.source_type);

          return (
            <details className="record-summary" key={record.id}>
              <summary>
                <span>{formatDate(record.record_date)}</span>
                <strong>
                  扣 {record.credit_used} {creditUnit}｜剩餘 {record.remaining_after ?? "未計算"} {creditUnit}
                </strong>
                <small>點開看商品明細</small>
              </summary>
              <div className="record-detail">
                <div className="record-items">
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
                </div>
                {note && <p className="muted">備註：{note}</p>}
              </div>
            </details>
          );
        })}
        {!bundle.redemptionRecords.length && <p className="muted empty-state">尚無領取紀錄</p>}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>未實現進度</h2>
          <span className="badge">{unrealizedProgress.length} 項</span>
        </div>
        <div className="unrealized-list">
          {unrealizedProgress.map((item) => (
            <details className="unrealized-card" key={item.id}>
              <summary>
                <p className="eyebrow">{formatDate(item.recordDate)}</p>
                <h3>{item.itemName}</h3>
                <small>點開看未領明細</small>
              </summary>
              <div className="unrealized-detail">
                <p className="muted">{item.planNote}</p>
                <div className="record-items">
                  <p>{item.receivedNote}</p>
                  <p>{item.remainingText}</p>
                </div>
              </div>
            </details>
          ))}
          {!unrealizedProgress.length && <p className="muted empty-state">目前沒有未實現進度</p>}
        </div>
      </section>
    </main>
  );
}
