import { NextResponse } from "next/server";

import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CancelPayload = {
  pendingId?: unknown;
  testMode?: unknown;
  adminUserId?: unknown;
};

type PendingRedemption = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  is_test: boolean;
};

export async function POST(request: Request) {
  let payload: CancelPayload;

  try {
    payload = (await request.json()) as CancelPayload;
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
        errors: ["目前取消 pending API 只開放 testMode=true"],
      },
      { status: 400 },
    );
  }

  const adminError = verifyLineAdminUserId(payload.adminUserId);
  if (adminError) return adminError;

  const supabase = createSupabaseServerClient();
  const { data: pending, error: pendingError } = await supabase
    .from("pending_redemptions")
    .select("id, status, is_test")
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
        errors: ["目前測試取消 API 只允許取消 is_test=true 的 pending"],
      },
      { status: 403 },
    );
  }

  if (pendingRedemption.status !== "pending") {
    return NextResponse.json(
      {
        ok: false,
        errors: [`這筆 pending 目前狀態是 ${pendingRedemption.status}，不能取消`],
      },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("pending_redemptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", pendingRedemption.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ ok: false, errors: [updateError.message] }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pendingId: pendingRedemption.id,
    status: "cancelled",
    testMode: true,
  });
}
