import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPasscode } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  adminPasscode: z.string(),
  status: z.enum(["unpaid", "paid", "late", "waived"]),
  paidDate: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ share_token: string; payment_record_id: string }> },
) {
  const { payment_record_id } = await params;
  const body = schema.parse(await request.json());
  const authError = verifyAdminPasscode(body.adminPasscode);

  if (authError) return authError;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_records")
    .update({
      status: body.status,
      paid_date: body.paidDate || null,
      method: body.method || null,
      notes: body.notes || null,
    })
    .eq("id", payment_record_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paymentRecordId: data.id });
}
