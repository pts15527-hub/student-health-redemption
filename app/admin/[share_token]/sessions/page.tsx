import { ClassSessionForm } from "@/components/AdminForms";

export default async function AdminSessionsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">管理操作</p>
          <h1>新增課程紀錄</h1>
        </div>
      </header>
      <section className="panel">
        <ClassSessionForm shareToken={share_token} />
      </section>
    </main>
  );
}
