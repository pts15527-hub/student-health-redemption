import { StatCard } from "@/components/StatCard";
import { getStudentBundle } from "@/lib/data";
import { formatRedemptionRuleTitle } from "@/lib/redemption-rule-display";
import type { RedemptionRule } from "@/types/domain";

function RuleSection({
  title,
  description,
  rules,
  creditUnit,
}: {
  title: string;
  description: string;
  rules: RedemptionRule[];
  creditUnit: string;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className="badge">{rules.length} 種規則</span>
      </div>
      <div className="rule-grid">
        {rules.map((rule) => (
          <article className="card rule-card" key={rule.id}>
            <div className="card-meta">
              <span className="badge">{rule.mode === "mix_and_match" ? "任搭" : "固定"}</span>
              <span className="muted">
                扣 {rule.credit_cost} {creditUnit}
              </span>
            </div>
            <h3>{formatRedemptionRuleTitle(rule, creditUnit)}</h3>
            <p>
              {rule.mode === "mix_and_match"
                ? `這一區的商品可任搭 ${rule.quantity_per_redemption} 盒`
                : `這一區每個品項一次領取 ${rule.quantity_per_redemption} 盒`}
            </p>
            <div className="plan-product-list">
              {rule.products?.map((product) => (
                <details className="plan-product-card" key={product.id}>
                  <summary>
                    {product.image_src && <img src={product.image_src} alt={product.image_alt ?? product.name} />}
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.specification || "規格待補"}</small>
                    </div>
                  </summary>
                  <div className="plan-product-detail">
                    <p>{product.primary_benefits || "功效說明待補"}</p>
                  </div>
                </details>
              ))}
              {!rule.products?.length && <p className="muted empty-state">商品待設定</p>}
            </div>
          </article>
        ))}
        {!rules.length && <p className="muted empty-state">目前尚無規則</p>}
      </div>
    </section>
  );
}

export default async function PlanPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const creditUnit = bundle.packagePlan?.credit_unit_label ?? "組";
  const fixedRules = bundle.redemptionRules.filter((rule) => rule.mode !== "mix_and_match");
  const mixRules = bundle.redemptionRules.filter((rule) => rule.mode === "mix_and_match");

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">我的保健食品方案</p>
          <h1>{bundle.packagePlan?.plan_name ?? "保健食品配置"}</h1>
          {bundle.packagePlan && (
            <p className="muted">
              重點看剩餘 {creditUnit}數，以及每個品項幾盒算 1 {creditUnit}。
            </p>
          )}
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
        <>
          <RuleSection
            title="固定兌換"
            description={`同一品項依固定盒數兌換，學生只要看這個品項一次會領幾盒、扣幾${creditUnit}。`}
            rules={fixedRules}
            creditUnit={creditUnit}
          />
          <RuleSection
            title="任搭兌換"
            description={`這一區可混搭，湊滿指定盒數後扣 1 ${creditUnit}。`}
            rules={mixRules}
            creditUnit={creditUnit}
          />
        </>
      )}
    </main>
  );
}
