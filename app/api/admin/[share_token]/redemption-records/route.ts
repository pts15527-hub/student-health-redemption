import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPasscode } from "@/lib/api-auth";
import { getStudentByShareToken } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  adminPasscode: z.string(),
  recordDate: z.string(),
  creditUsed: z.number().min(0),
  notes: z.string().optional().nullable(),
  itemsText: z.string().min(1),
  bonusItemsText: z.string().optional().nullable(),
});

function parseItems(text: string | null | undefined) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, quantity] = line.split(",").map((part) => part.trim());
      return {
        item_name: name,
        quantity: Number(quantity || 1),
      };
    })
    .filter((item) => item.item_name && item.quantity > 0);
}

export async function POST(request: Request, { params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const json = await request.json();
  const body = schema.parse(json);
  const authError = verifyAdminPasscode(body.adminPasscode);

  if (authError) return authError;

  const supabase = createSupabaseServerClient();
  const student = await getStudentByShareToken(share_token);

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const { data: packagePlan } = await supabase.from("package_plans").select("*").eq("student_id", student.id).maybeSingle();
  const { data: record, error } = await supabase
    .from("redemption_records")
    .insert({
      student_id: student.id,
      package_plan_id: packagePlan?.id ?? null,
      record_date: body.recordDate,
      source_type: "manual",
      credit_used: body.creditUsed,
      notes: body.notes || null,
    })
    .select("*")
    .single();

  if (error || !record) {
    return NextResponse.json({ error: error?.message ?? "Failed to create redemption record." }, { status: 500 });
  }

  const items = parseItems(body.itemsText).map((item) => ({ ...item, redemption_record_id: record.id }));
  const bonusItems = parseItems(body.bonusItemsText).map((item) => ({ ...item, redemption_record_id: record.id }));

  if (items.length) {
    const { error: itemError } = await supabase.from("redemption_record_items").insert(items);
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (bonusItems.length) {
    const { error: bonusError } = await supabase.from("redemption_record_bonus_items").insert(bonusItems);
    if (bonusError) return NextResponse.json({ error: bonusError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recordId: record.id });
}
