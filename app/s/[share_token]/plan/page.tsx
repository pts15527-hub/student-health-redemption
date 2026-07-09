import { StatCard } from "@/components/StatCard";
import { getStudentBundle } from "@/lib/data";

export default async function PlanPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const creditUnit = bundle.packagePlan?.credit_unit_label ?? "組";

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">我的保健食品方案</p>
          <h1>{bundle.packagePlan?.plan_name ?? "保健食品配置"}</h1>
        </div>
      </header>

      {bundle.packagePlan ? (
        <section className="panel">
          <div className="stat-grid">
            <StatCard label={`總${creditUnit}數`} value={bundle.stats.totalCredits} />
            <StatCard label={`已扣${creditUnit}數`} value={bundle.stats.usedCredits} accent />
            <StatCard label={`剩餘${creditUnit}數`} value={bundle.stats.remainingCredits} />
          </div>
          {bundle.packagePlan.notes && <p className="muted">{bundle.packagePlan.notes}</p>}
        </section>
      ) : (
        <section className="panel empty-state">
          <h2>尚無保健食品方案</h2>
          <p className="muted">方案設定後，總數與兌換規則會顯示在這裡。</p>
        </section>
      )}

      {bundle.packagePlan && (
        <section className="panel">
          <h2>兌換規則</h2>
          <div className="grid-2">
            {bundle.redemptionRules.map((rule) => (
              <article className="card" key={rule.id}>
                <span className="badge">{rule.mode === "mix_and_match" ? "任搭" : "固定"}</span>
                <h3>{rule.label}</h3>
                <p className="muted">
                  {rule.mode === "mix_and_match"
                    ? `任搭 ${rule.quantity_per_redemption} 盒，扣 ${rule.credit_cost} ${creditUnit}`
                    : `${rule.quantity_per_redemption} 盒一${creditUnit}，每次扣 ${rule.credit_cost} ${creditUnit}`}
                </p>
                <p>{rule.products?.map((product) => product.name).join("、") || "商品待設定"}</p>
              </article>
            ))}
            {!bundle.redemptionRules.length && <p className="muted empty-state">目前尚無兌換規則</p>}
          </div>
        </section>
      )}
    </main>
  );
}
