export type ClassSessionStatus = "scheduled" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "late" | "waived";
export type RedemptionSourceType = "rule" | "bundle" | "promotion" | "manual";

export type Student = {
  id: string;
  share_token: string;
  name: string;
  project_name: string;
  notes: string | null;
  risk_notes: string[];
};

export type CourseContract = {
  id: string;
  student_id: string;
  plan_name: string;
  total_sessions: number;
  start_date: string;
  duration_months: number;
  buffer_months: number;
  location: string | null;
  service_items: string[];
  cancellation_policy: string | null;
  pregnancy_policy: string | null;
  notes: string | null;
};

export type ClassSession = {
  id: string;
  student_id: string;
  session_date: string;
  session_time: string | null;
  title: string;
  status: ClassSessionStatus;
  content: string | null;
  notes: string | null;
  counts_toward_used_sessions: boolean;
};

export type BillingPlan = {
  id: string;
  student_id: string;
  total_amount: number;
  installment_count: number;
  amount_per_installment: number;
  due_day_of_month: number;
  start_date: string;
  notes: string | null;
};

export type PaymentRecord = {
  id: string;
  student_id: string;
  billing_plan_id: string | null;
  installment_no: number;
  due_date: string;
  paid_date: string | null;
  amount: number;
  status: PaymentStatus;
  method: string | null;
  notes: string | null;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  specification: string;
  primary_benefits: string;
  product_line: string | null;
  image_src: string | null;
  image_alt: string | null;
  image_aliases: string[];
  is_available: boolean;
  notes: string | null;
};

export type PackagePlan = {
  id: string;
  student_id: string;
  plan_name: string;
  total_credits: number;
  credit_unit_label: string;
  start_date: string | null;
  notes: string | null;
};

export type RedemptionRule = {
  id: string;
  package_plan_id: string;
  label: string;
  mode: "fixed_quantity" | "mix_and_match" | "single_item";
  credit_cost: number;
  quantity_per_redemption: number;
  notes: string | null;
  products?: Product[];
};

export type RedemptionRecordItem = {
  id: string;
  redemption_record_id: string;
  product_id: string | null;
  item_name: string;
  quantity: number;
  notes: string | null;
};

export type RedemptionRecordBonusItem = RedemptionRecordItem;

export type RedemptionRecord = {
  id: string;
  student_id: string;
  package_plan_id: string | null;
  record_date: string;
  source_type: RedemptionSourceType;
  source_id: string | null;
  credit_used: number;
  notes: string | null;
  items?: RedemptionRecordItem[];
  bonus_items?: RedemptionRecordBonusItem[];
  remaining_after?: number;
};

export type StudentBundle = {
  student: Student;
  courseContract: CourseContract | null;
  classSessions: ClassSession[];
  billingPlan: BillingPlan | null;
  paymentRecords: PaymentRecord[];
  products: Product[];
  packagePlan: PackagePlan | null;
  redemptionRules: RedemptionRule[];
  redemptionRecords: RedemptionRecord[];
  stats: {
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    totalSessions: number;
    completedSessions: number;
    scheduledSessions: number;
    remainingSessions: number;
    remainingBookableSessions: number;
    paidInstallments: number;
    installmentCount: number;
  };
};
