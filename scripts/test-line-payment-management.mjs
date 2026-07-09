import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const token = `line-payment-test-${Date.now()}`;
let studentId;

try {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      share_token: token,
      name: "LINE payment test",
      project_name: "Temporary test",
    })
    .select("id")
    .single();

  if (studentError || !student) throw new Error(studentError?.message ?? "Failed to create test student.");
  studentId = student.id;

  const { error: paymentError } = await supabase.from("payment_records").insert({
    student_id: studentId,
    installment_no: 1,
    due_date: "2026-07-20",
    amount: 16000,
    status: "unpaid",
  });

  if (paymentError) throw new Error(paymentError.message);

  const {
    markLinePaymentPaid,
    markLinePaymentUnpaid,
  } = await import("../lib/line/payment-management.ts");

  const paid = await markLinePaymentPaid(studentId, 1, "2026-07-10");
  if (paid.error || paid.data?.status !== "paid" || paid.data?.paid_date !== "2026-07-10") {
    throw new Error(paid.error?.message ?? `Unexpected paid state: ${JSON.stringify(paid.data)}`);
  }

  const unpaid = await markLinePaymentUnpaid(studentId, 1);
  if (unpaid.error || unpaid.data?.status !== "unpaid" || unpaid.data?.paid_date !== null) {
    throw new Error(unpaid.error?.message ?? `Unexpected unpaid state: ${JSON.stringify(unpaid.data)}`);
  }

  console.log("LINE payment management test OK");
} finally {
  if (studentId) await supabase.from("students").delete().eq("id", studentId);
}
