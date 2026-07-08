import { StatCard } from "@/components/StatCard";
import { getStudentBundle } from "@/lib/data";

export default async function PlanPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">我的保健食品方案</p>
          <h1>{bundle.packagePlan?.plan_name ?? "保健食品配置"}</h1>
        </div>
      </header>

      <section className="panel">
        <div className="stat-grid">
          <StatCard label="總組數" value={bundle.stats.totalCredits} />
          <StatCard label="已扣組數" value={bundle.stats.usedCredits} accent />
          <StatCard label="剩餘組數" value={bundle.stats.remainingCredits} />
        </div>
      </section>

      <section className="panel">
        <h2>兌換規則</h2>
        <div className="grid-2">
          {bundle.redemptionRules.map((rule) => (
            <article className="card" key={rule.id}>
              <span className="badge">{rule.mode === "mix_and_match" ? "任搭" : "固定"}</span>
              <h3>{rule.label}</h3>
              <p className="muted">扣 {rule.credit_cost} 組，可選 {rule.quantity_per_redemption} 盒</p>
              <p>{rule.products?.map((product) => product.name).join("、") || "商品待設定"}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
