import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  BillingPlan,
  ClassSession,
  CourseContract,
  PackagePlan,
  PaymentRecord,
  Product,
  RedemptionRecord,
  RedemptionRule,
  Student,
  StudentBundle,
} from "@/types/domain";

type RedemptionRuleJoin = Omit<RedemptionRule, "products"> & {
  products?: Array<{
    products: Product | null;
  }>;
};

function numeric(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function getStudentByShareToken(shareToken: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("students").select("*").eq("share_token", shareToken).single();

  if (error || !data) {
    return null;
  }

  return data as Student;
}

export async function getStudentBundle(shareToken: string): Promise<StudentBundle> {
  const supabase = createSupabaseServerClient();
  const student = await getStudentByShareToken(shareToken);

  if (!student) {
    notFound();
  }

  const [
    courseContractResult,
    classSessionsResult,
    billingPlanResult,
    paymentRecordsResult,
    productsResult,
    packagePlanResult,
  ] = await Promise.all([
    supabase.from("course_contracts").select("*").eq("student_id", student.id).maybeSingle(),
    supabase.from("class_sessions").select("*").eq("student_id", student.id).order("session_date", { ascending: false }),
    supabase.from("billing_plans").select("*").eq("student_id", student.id).maybeSingle(),
    supabase.from("payment_records").select("*").eq("student_id", student.id).order("installment_no", { ascending: true }),
    supabase.from("products").select("*").order("category", { ascending: true }).order("name", { ascending: true }),
    supabase.from("package_plans").select("*").eq("student_id", student.id).maybeSingle(),
  ]);

  const packagePlan = (packagePlanResult.data as PackagePlan | null) ?? null;

  const [redemptionRulesResult, redemptionRecordsResult] = await Promise.all([
    packagePlan
      ? supabase
          .from("redemption_rules")
          .select("*, products: redemption_rule_products(products(*))")
          .eq("package_plan_id", packagePlan.id)
          .order("quantity_per_redemption", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("redemption_records")
      .select("*, items:redemption_record_items(*), bonus_items:redemption_record_bonus_items(*)")
      .eq("student_id", student.id)
      .order("record_date", { ascending: false }),
  ]);

  const redemptionRecords = ((redemptionRecordsResult.data ?? []) as RedemptionRecord[]).map((record) => ({
    ...record,
    credit_used: numeric(record.credit_used),
  }));
  const totalCredits = numeric(packagePlan?.total_credits);
  const usedCredits = redemptionRecords.reduce((sum, record) => sum + numeric(record.credit_used), 0);
  const completedSessions = ((classSessionsResult.data ?? []) as ClassSession[]).filter((session) => session.status === "completed").length;
  const scheduledSessions = ((classSessionsResult.data ?? []) as ClassSession[]).filter((session) => session.status === "scheduled").length;
  const totalSessions = (courseContractResult.data as CourseContract | null)?.total_sessions ?? 0;
  const paymentRecords = (paymentRecordsResult.data ?? []) as PaymentRecord[];
  const paidInstallments = paymentRecords.filter((record) => record.status === "paid").length;
  const installmentCount = (billingPlanResult.data as BillingPlan | null)?.installment_count ?? paymentRecords.length;

  let remaining = totalCredits;
  const recordsWithRemaining = [...redemptionRecords]
    .sort((a, b) => a.record_date.localeCompare(b.record_date))
    .map((record) => {
      remaining -= numeric(record.credit_used);
      return { ...record, remaining_after: remaining };
    })
    .sort((a, b) => b.record_date.localeCompare(a.record_date));

  return {
    student,
    courseContract: (courseContractResult.data as CourseContract | null) ?? null,
    classSessions: (classSessionsResult.data ?? []) as ClassSession[],
    billingPlan: (billingPlanResult.data as BillingPlan | null) ?? null,
    paymentRecords,
    products: (productsResult.data ?? []) as Product[],
    packagePlan,
    redemptionRules: ((redemptionRulesResult.data ?? []) as unknown as RedemptionRuleJoin[]).map((rule) => ({
      ...rule,
      credit_cost: numeric(rule.credit_cost),
      products: (rule.products ?? []).map((entry) => entry.products).filter((product): product is Product => Boolean(product)),
    })),
    redemptionRecords: recordsWithRemaining,
    stats: {
      totalCredits,
      usedCredits,
      remainingCredits: Math.max(totalCredits - usedCredits, 0),
      totalSessions,
      completedSessions,
      scheduledSessions,
      remainingSessions: Math.max(totalSessions - completedSessions, 0),
      remainingBookableSessions: Math.max(totalSessions - completedSessions - scheduledSessions, 0),
      paidInstallments,
      installmentCount,
    },
  };
}
