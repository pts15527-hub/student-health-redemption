import { getStudentBundle } from "@/lib/data";

const categoryOrder = [
  "高端抗老",
  "全能守護",
  "美容保養",
  "營養補充",
  "纖體瘦身",
  "骨關節保養",
  "心血管 / 循環系統保養",
  "益生菌",
  "健康機能",
  "眼 / 腦保養",
  "增強體力 / 能量充沛",
  "男女專屬",
];

export default async function CatalogPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const productCategories = Array.from(new Set(bundle.products.map((product) => product.category)));
  const categories = [
    ...categoryOrder.filter((category) => productCategories.includes(category)),
    ...productCategories.filter((category) => !categoryOrder.includes(category)),
  ];

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">保健食品型錄</p>
          <h1>分類瀏覽</h1>
        </div>
      </header>

      {!categories.length && <section className="panel empty-state">目前尚無可顯示的商品</section>}

      {categories.map((category) => (
        <section className="panel" key={category}>
          <div className="section-heading">
            <h2>{category}</h2>
          </div>
          <div className="grid-3">
            {bundle.products
              .filter((product) => product.category === category)
              .map((product) => {
                const rules = bundle.redemptionRules.filter((rule) => rule.products?.some((item) => item.id === product.id));
                return (
                  <article className="card product-card" key={product.id}>
                    {product.image_src && <img src={product.image_src} alt={product.image_alt ?? product.name} />}
                    <span className={`badge ${product.is_available ? "" : "unavailable"}`}>
                      {product.is_available ? "可兌換" : "暫停兌換"}
                    </span>
                    <h3>{product.name}</h3>
                    <p className="muted">{product.specification}</p>
                    <p>{product.primary_benefits}</p>
                    <p className="muted">兌換：{rules.map((rule) => rule.label).join("、") || "待設定"}</p>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </main>
  );
}
