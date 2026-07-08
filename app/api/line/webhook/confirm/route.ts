import { NextResponse } from "next/server";

import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ConfirmPayload = {
  pendingId?: unknown;
  testMode?: unknown;
  adminUserId?: unknown;
};

type PendingRedemption = {
  id: string;
  student_id: string;
  raw_message: string;
  parsed_payload: ParsedPayload;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  is_test: boolean;
  expires_at: string;
};

type ParsedPayload = {
  date: string;
  creditUsed: number;
  totalBoxes: number;
  generalItems: ParsedItem[];
  mixGroups: Array<{
    items: ParsedItem[];
  }>;
};

type ParsedItem = {
  productSlug: string;
  productName: string;
  boxes: number;
};

export async function POST(request: Request) {
  let payload: ConfirmPayload;

  try {
    payload = (await request.json()) as ConfirmPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: ["請送出 JSON body，例如：{ \"pendingId\": \"...\", \"testMode\": true }"],
      },
      { status: 400 },
    );
  }

  if (typeof payload.pendingId !== "string" || payload.pendingId.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errors: ["pendingId 必須是非空白字串"],
      },
      { status: 400 },
    );
  }

  if (payload.testMode !== true) {
    return NextResponse.json(
      {
        ok: false,
        errors: ["目前確認送出 API 只開放 testMode=true"],
      },
      { status: 400 },
    );
  }

  const adminError = verifyLineAdminUserId(payload.adminUserId);
  if (adminError) return adminError;

  const supabase = createSupabaseServerClient();
  const { data: pending, error: pendingError } = await supabase
    .from("pending_redemptions")
    .select("id, student_id, raw_message, parsed_payload, status, is_test, expires_at")
    .eq("id", payload.pendingId)
    .maybeSingle();

  if (pendingError) {
    return NextResponse.json({ ok: false, errors: [pendingError.message] }, { status: 500 });
  }

  if (!pending) {
    return NextResponse.json({ ok: false, errors: ["找不到 pending redemption"] }, { status: 404 });
  }

  const pendingRedemption = pending as PendingRedemption;

  if (!pendingRedemption.is_test) {
    return NextResponse.json(
      {
        ok: false,
        errors: ["目前測試確認 API 只允許確認 is_test=true 的 pending"],
      },
      { status: 403 },
    );
  }

  if (pendingRedemption.status !== "pending") {
    return NextResponse.json(
      {
        ok: false,
        errors: [`這筆 pending 目前狀態是 ${pendingRedemption.status}，不能再次確認`],
      },
      { status: 409 },
    );
  }

  if (new Date(pendingRedemption.expires_at).getTime() < Date.now()) {
    await supabase
      .from("pending_redemptions")
      .update({ status: "expired" })
      .eq("id", pendingRedemption.id)
      .eq("status", "pending");

    return NextResponse.json(
      {
        ok: false,
        errors: ["這筆 pending 已逾時，請重新輸入領取紀錄"],
      },
      { status: 410 },
    );
  }

  const parsed = pendingRedemption.parsed_payload;
  const productSlugs = collectProductSlugs(parsed);
  const { data: products, error: productsError } = await supabase.from("products").select("id, slug").in("slug", productSlugs);

  if (productsError) {
    return NextResponse.json({ ok: false, errors: [productsError.message] }, { status: 500 });
  }

  const productIdBySlug = new Map((products ?? []).map((product) => [product.slug, product.id]));
  const missingSlugs = productSlugs.filter((slug) => !productIdBySlug.has(slug));

  if (missingSlugs.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        errors: [`找不到商品資料：${missingSlugs.join(", ")}`],
      },
      { status: 422 },
    );
  }

  const { data: packagePlan } = await supabase
    .from("package_plans")
    .select("id")
    .eq("student_id", pendingRedemption.student_id)
    .maybeSingle();

  const { data: record, error: recordError } = await supabase
    .from("redemption_records")
    .insert({
      student_id: pendingRedemption.student_id,
      package_plan_id: packagePlan?.id ?? null,
      record_date: parsed.date,
      source_type: "manual",
      source_id: pendingRedemption.id,
      credit_used: parsed.creditUsed,
      notes: `[TEST] LINE pending confirmation ${pendingRedemption.id}`,
    })
    .select("id")
    .single();

  if (recordError || !record) {
    return NextResponse.json(
      {
        ok: false,
        errors: [recordError?.message ?? "建立 redemption record 失敗"],
      },
      { status: 500 },
    );
  }

  const items = collectItems(parsed).map((item) => ({
    redemption_record_id: record.id,
    product_id: productIdBySlug.get(item.productSlug) ?? null,
    item_name: item.productName,
    quantity: item.boxes,
    notes: "[TEST] from pending redemption",
  }));

  const { error: itemError } = await supabase.from("redemption_record_items").insert(items);

  if (itemError) {
    await supabase.from("redemption_records").delete().eq("id", record.id);
    return NextResponse.json({ ok: false, errors: [itemError.message] }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("pending_redemptions")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", pendingRedemption.id)
    .eq("status", "pending");

  if (updateError) {
    await supabase.from("redemption_records").delete().eq("id", record.id);
    return NextResponse.json({ ok: false, errors: [updateError.message] }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    recordId: record.id,
    pendingId: pendingRedemption.id,
    creditUsed: parsed.creditUsed,
    totalBoxes: parsed.totalBoxes,
    itemCount: items.length,
    testMode: true,
  });
}

function collectItems(parsed: ParsedPayload) {
  return [...parsed.generalItems, ...parsed.mixGroups.flatMap((group) => group.items)];
}

function collectProductSlugs(parsed: ParsedPayload) {
  return Array.from(new Set(collectItems(parsed).map((item) => item.productSlug)));
}
