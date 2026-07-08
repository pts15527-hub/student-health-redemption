import { PaymentManager } from "@/components/AdminForms";
import { getStudentBundle } from "@/lib/data";

export default async function AdminPaymentsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">管理操作</p>
          <h1>繳費管理</h1>
        </div>
      </header>
      <section className="panel">
        <PaymentManager shareToken={share_token} records={bundle.paymentRecords} />
      </section>
    </main>
  );
}
