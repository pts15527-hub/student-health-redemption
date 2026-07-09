import { getStudentByShareToken } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StudentPackagePlanSeed } from "@/src/data";

type RuleJoin = {
  label: string;
  mode: "fixed_quantity" | "mix_and_match" | "single_item";
  credit_cost: number | string;
  quantity_per_redemption: number;
  notes: string | null;
  products?: Array<{
    products: { slug: string } | null;
  }>;
};

export async function loadStudentRedemptionPlan(shareToken: string) {
  const student = await getStudentByShareToken(shareToken);
  if (!student) {
    return { ok: false as const, errors: ["找不到目前選取的學生資料"] };
  }

  const supabase = createSupabaseServerClient();
  const { data: packagePlan, error: packagePlanError } = await supabase
    .from("package_plans")
    .select("id, plan_name, total_credits, credit_unit_label, start_date")
    .eq("student_id", student.id)
    .maybeSingle();

  if (packagePlanError) {
    return { ok: false as const, errors: [packagePlanError.message] };
  }

  if (!packagePlan) {
    return { ok: false as const, errors: [`${student.name}尚未設定保健食品方案`] };
  }

  const { data: rules, error: rulesError } = await supabase
    .from("redemption_rules")
    .select("label, mode, credit_cost, quantity_per_redemption, notes, products:redemption_rule_products(products(slug))")
    .eq("package_plan_id", packagePlan.id);

  if (rulesError) {
    return { ok: false as const, errors: [rulesError.message] };
  }

  if (!rules?.length) {
    return { ok: false as const, errors: [`${student.name}尚未設定兌換規則`] };
  }

  const plan: StudentPackagePlanSeed = {
    shareToken: student.share_token,
    planName: packagePlan.plan_name,
    totalCredits: Number(packagePlan.total_credits),
    creditUnitLabel: packagePlan.credit_unit_label,
    startDate: packagePlan.start_date ?? "",
    rules: (rules as unknown as RuleJoin[]).map((rule) => ({
      label: rule.label,
      mode: rule.mode,
      creditCost: Number(rule.credit_cost),
      quantityPerRedemption: rule.quantity_per_redemption,
      notes: rule.notes ?? "",
      productSlugs: (rule.products ?? [])
        .map((entry) => entry.products?.slug)
        .filter((slug): slug is string => Boolean(slug)),
    })),
  };

  return { ok: true as const, student, packagePlanId: packagePlan.id, plan };
}
