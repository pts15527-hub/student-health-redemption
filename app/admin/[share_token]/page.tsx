import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { getStudentBundle } from "@/lib/data";

export default async function AdminPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">管理操作模式</p>
          <h1>{bundle.student.name}</h1>
        </div>
        <Link className="button secondary" href={`/s/${share_token}`}>查看學生端</Link>
      </header>

      <section className="panel">
        <div className="stat-grid">
          <StatCard label="剩餘組數" value={bundle.stats.remainingCredits} accent />
          <StatCard label="已扣組數" value={bundle.stats.usedCredits} />
          <StatCard label="已完成堂數" value={bundle.stats.completedSessions} />
          <StatCard label="已繳期數" value={`${bundle.stats.paidInstallments}/${bundle.stats.installmentCount}`} />
        </div>
      </section>

      <section className="grid-3">
        <Link className="card" href={`/admin/${share_token}/records`}>
          <h2>新增領取紀錄</h2>
          <p className="muted">記錄商品、贈品與扣除組數。</p>
        </Link>
        <Link className="card" href={`/admin/${share_token}/sessions`}>
          <h2>新增課程紀錄</h2>
          <p className="muted">新增預約、完成或取消紀錄。</p>
        </Link>
        <Link className="card" href={`/admin/${share_token}/payments`}>
          <h2>繳費管理</h2>
          <p className="muted">將 6 期繳費標記為已繳。</p>
        </Link>
      </section>
    </main>
  );
}
