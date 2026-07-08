import { NextResponse } from "next/server";

import { getStudentByShareToken } from "@/lib/data";
import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { extractLineTextCommands, isLineWebhookBody } from "@/lib/line/events";
import { parseRedemptionMessage } from "@/lib/line/redemption-parser";
import { replyLineText } from "@/lib/line/reply";
import { verifyLineSignatureGuard } from "@/lib/line/signature";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { yiNingPackagePlan } from "@/src/data/students/yi-ning";

type LocalWebhookPayload = {
  shareToken?: unknown;
  messageText?: unknown;
  persistPending?: unknown;
  isTest?: unknown;
  adminUserId?: unknown;
};

const PENDING_TTL_MINUTES = 10;

export async function POST(request: Request) {
  let payload: unknown;
  const rawBody = await request.text();
  const signatureError = verifyLineSignatureGuard(rawBody, request.headers);

  if (signatureError) return signatureError;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: ["請送出 JSON body，例如：{ \"shareToken\": \"yi-ning\", \"messageText\": \"7/1\\nB群 1組\" }"],
      },
      { status: 400 },
    );
  }

  if (isLineWebhookBody(payload)) {
    return handleLineWebhookBody(payload);
  }

  return handleLocalWebhookPayload(payload as LocalWebhookPayload);
}

async function handleLineWebhookBody(payload: unknown) {
  if (!isLineWebhookBody(payload)) {
    return NextResponse.json({ ok: false, errors: ["不是有效的 LINE webhook body"] }, { status: 400 });
  }

  const commands = extractLineTextCommands(payload);

  if (process.env.LINE_DEBUG_LOG_USER_IDS === "true") {
    for (const command of commands) {
      console.info("[line-webhook] received userId", {
        userId: command.adminUserId,
        textPreview: command.messageText.slice(0, 20),
      });
    }
  }

  if (commands.length === 0) {
    return NextResponse.json({
      ok: true,
      handled: 0,
      replies: [],
    });
  }

  const replies = [];

  for (const command of commands) {
    const result = await buildParsedRedemptionResponse({
      shareToken: yiNingPackagePlan.shareToken,
      messageText: command.messageText,
      persistPending: true,
      isTest: process.env.LINE_EVENT_TEST_MODE !== "false",
      adminUserId: command.adminUserId,
      pendingSource: "line-event",
    });

    const replyText = result.ok ? result.replyText : result.errors.join("\n");
    const replyResult = await replyLineText(command.replyToken, replyText);

    replies.push({
      ok: result.ok,
      replyToken: command.replyToken,
      reply: replyResult,
      pending: result.ok ? result.pending ?? null : null,
      errors: result.ok ? [] : result.errors,
    });
  }

  return NextResponse.json({
    ok: replies.every((reply) => reply.ok),
    handled: replies.length,
    replies,
  });
}

async function handleLocalWebhookPayload(payload: LocalWebhookPayload) {
  if (payload.shareToken !== yiNingPackagePlan.shareToken) {
    return NextResponse.json(
      {
        ok: false,
        errors: [`目前本機 webhook skeleton 只支援 shareToken=${yiNingPackagePlan.shareToken}`],
      },
      { status: 400 },
    );
  }

  const result = await buildParsedRedemptionResponse({
    shareToken: payload.shareToken,
    messageText: payload.messageText,
    persistPending: payload.persistPending,
    isTest: payload.isTest,
    adminUserId: payload.adminUserId,
    pendingSource: "line-local-skeleton",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        errors: result.errors,
      },
      { status: result.status },
    );
  }

  return NextResponse.json(result);
}

type BuildResponseInput = {
  shareToken: unknown;
  messageText: unknown;
  persistPending: unknown;
  isTest: unknown;
  adminUserId: unknown;
  pendingSource: string;
};

type BuildResponseResult =
  | {
      ok: true;
      replyText: string;
      pending?: {
        id: string;
        expiresAt: string;
        isTest: boolean;
      };
      parsed: ReturnType<typeof toWebhookParsedPayload>;
    }
  | {
      ok: false;
      errors: string[];
      status: number;
    };

async function buildParsedRedemptionResponse(input: BuildResponseInput): Promise<BuildResponseResult> {
  if (typeof input.messageText !== "string" || input.messageText.trim().length === 0) {
    return {
      ok: false,
      errors: ["messageText 必須是非空白文字"],
      status: 400,
    };
  }

  const parsed = parseRedemptionMessage(input.messageText, yiNingPackagePlan);

  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors,
      status: 422,
    };
  }

  const responseBody: Extract<BuildResponseResult, { ok: true }> = {
    ok: true,
    replyText: parsed.data.confirmationText,
    parsed: toWebhookParsedPayload(parsed.data),
  };

  if (input.persistPending === true) {
    const adminError = verifyLineAdminUserId(input.adminUserId);
    if (adminError) {
      const body = await adminError.json();
      return {
        ok: false,
        errors: Array.isArray(body.errors) ? body.errors : ["操作者驗證失敗"],
        status: adminError.status,
      };
    }

    const student = await getStudentByShareToken(yiNingPackagePlan.shareToken);

    if (!student) {
      return {
        ok: false,
        errors: ["找不到學生資料，無法建立 pending redemption"],
        status: 404,
      };
    }

    const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000).toISOString();
    const supabase = createSupabaseServerClient();
    const { data: pending, error } = await supabase
      .from("pending_redemptions")
      .insert({
        student_id: student.id,
        source: input.pendingSource,
        raw_message: input.messageText,
        reply_text: parsed.data.confirmationText,
        parsed_payload: responseBody.parsed,
        status: "pending",
        is_test: input.isTest !== false,
        expires_at: expiresAt,
      })
      .select("id, expires_at, is_test")
      .single();

    if (error || !pending) {
      return {
        ok: false,
        errors: [error?.message ?? "建立 pending redemption 失敗"],
        status: 500,
      };
    }

    responseBody.pending = {
      id: pending.id,
      expiresAt: pending.expires_at,
      isTest: pending.is_test,
    };
  }

  return responseBody;
}

function toWebhookParsedPayload(data: Extract<ReturnType<typeof parseRedemptionMessage>, { ok: true }>["data"]) {
  return {
    date: data.date,
    creditUsed: data.creditUsed,
    totalBoxes: data.totalBoxes,
    generalItems: data.generalItems.map((item) => ({
      alias: item.alias,
      productSlug: item.productSlug,
      productName: item.productName,
      inputQuantity: item.inputQuantity,
      inputUnit: item.inputUnit,
      boxes: item.boxes,
      creditUsed: item.creditUsed,
    })),
    mixGroups: data.mixGroups.map((group) => ({
      label: group.label,
      creditUsed: group.creditUsed,
      boxes: group.boxes,
      items: group.items.map((item) => ({
        alias: item.alias,
        productSlug: item.productSlug,
        productName: item.productName,
        inputQuantity: item.inputQuantity,
        inputUnit: item.inputUnit,
        boxes: item.boxes,
      })),
    })),
  };
}
