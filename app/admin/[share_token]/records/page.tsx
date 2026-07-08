import { RedemptionRecordForm } from "@/components/AdminForms";

export default async function AdminRecordsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">管理操作</p>
          <h1>新增領取紀錄</h1>
        </div>
      </header>
      <section className="panel">
        <RedemptionRecordForm shareToken={share_token} />
      </section>
    </main>
  );
}
