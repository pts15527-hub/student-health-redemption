import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPasscode } from "@/lib/api-auth";
import { getStudentByShareToken } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  adminPasscode: z.string(),
  installmentNo: z.number().int().positive(),
  dueDate: z.string(),
  paidDate: z.string().optional().nullable(),
  amount: z.number().min(0),
  status: z.enum(["unpaid", "paid", "late", "waived"]),
  method: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const body = schema.parse(await request.json());
  const authError = verifyAdminPasscode(body.adminPasscode);

  if (authError) return authError;

  const student = await getStudentByShareToken(share_token);

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();
  const { data: billingPlan } = await supabase.from("billing_plans").select("*").eq("student_id", student.id).maybeSingle();
  const { data, error } = await supabase
    .from("payment_records")
    .insert({
      student_id: student.id,
      billing_plan_id: billingPlan?.id ?? null,
      installment_no: body.installmentNo,
      due_date: body.dueDate,
      paid_date: body.paidDate || null,
      amount: body.amount,
      status: body.status,
      method: body.method || null,
      notes: body.notes || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paymentRecordId: data.id });
}
