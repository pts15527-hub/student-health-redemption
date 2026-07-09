import { createSupabaseServerClient } from "../supabase/server.ts";

export type LinePaymentRecord = {
  id: string;
  installment_no: number;
  due_date: string;
  paid_date: string | null;
  amount: number;
  status: "unpaid" | "paid" | "late" | "waived";
};

export async function listLinePaymentRecords(studentId: string) {
  const supabase = createSupabaseServerClient();
  return supabase
    .from("payment_records")
    .select("id, installment_no, due_date, paid_date, amount, status")
    .eq("student_id", studentId)
    .order("installment_no", { ascending: true });
}

export async function getLinePaymentRecord(studentId: string, installmentNo: number) {
  const supabase = createSupabaseServerClient();
  return supabase
    .from("payment_records")
    .select("id, installment_no, due_date, paid_date, amount, status")
    .eq("student_id", studentId)
    .eq("installment_no", installmentNo)
    .maybeSingle();
}

export async function markLinePaymentPaid(studentId: string, installmentNo: number, paidDate: string) {
  const supabase = createSupabaseServerClient();
  return supabase
    .from("payment_records")
    .update({
      status: "paid",
      paid_date: paidDate,
    })
    .eq("student_id", studentId)
    .eq("installment_no", installmentNo)
    .neq("status", "paid")
    .select("id, installment_no, due_date, paid_date, amount, status")
    .maybeSingle();
}

export async function markLinePaymentUnpaid(studentId: string, installmentNo: number) {
  const supabase = createSupabaseServerClient();
  return supabase
    .from("payment_records")
    .update({
      status: "unpaid",
      paid_date: null,
      method: null,
    })
    .eq("student_id", studentId)
    .eq("installment_no", installmentNo)
    .eq("status", "paid")
    .select("id, installment_no, due_date, paid_date, amount, status")
    .maybeSingle();
}
