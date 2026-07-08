import { NextResponse } from "next/server";

import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { cancelPendingRedemption } from "@/lib/line/pending-redemptions";

type CancelPayload = {
  pendingId?: unknown;
  testMode?: unknown;
  adminUserId?: unknown;
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

  const result = await cancelPendingRedemption(payload.pendingId, { requireTest: true });

  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: result.statusCode });
  }

  return NextResponse.json({
    ...result,
    testMode: result.isTest,
  });
}
