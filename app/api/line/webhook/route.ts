import { NextResponse } from "next/server";

import { getStudentByShareToken } from "@/lib/data";
import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { normalizeBookingInput, parseBookingInput } from "@/lib/line/course-booking";
import { extractLineTextCommands, isLineWebhookBody } from "@/lib/line/events";
import {
  cancelPendingRedemption,
  confirmPendingRedemption,
  findLatestPendingRedemption,
} from "@/lib/line/pending-redemptions";
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
    const bookingResult = await handleBookingInput(command.messageText, command.adminUserId);

    if (bookingResult) {
      const replyResult = await replyLineText(command.replyToken, bookingResult.replyText, {
        quickReplies: bookingResult.quickReplies,
      });

      replies.push({
        ok: bookingResult.ok,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: bookingResult.ok ? [] : bookingResult.errors,
      });

      continue;
    }

    const pendingActionResult = await handlePendingAction(command.messageText, command.adminUserId);

    if (pendingActionResult) {
      const replyResult = await replyLineText(command.replyToken, pendingActionResult.replyText);

      replies.push({
        ok: pendingActionResult.ok,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: pendingActionResult.ok ? [] : pendingActionResult.errors,
      });

      continue;
    }

    const menuResult = await buildLineMenuResponse(command.messageText, command.adminUserId);

    if (menuResult) {
      const replyResult = await replyLineText(command.replyToken, menuResult.replyText, {
        quickReplies: menuResult.quickReplies,
      });

      replies.push({
        ok: menuResult.ok,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: menuResult.ok ? [] : menuResult.errors,
      });

      continue;
    }

    const result = await buildParsedRedemptionResponse({
      shareToken: yiNingPackagePlan.shareToken,
      messageText: command.messageText,
      persistPending: true,
      isTest: process.env.LINE_EVENT_TEST_MODE !== "false",
      adminUserId: command.adminUserId,
      pendingSource: "line-event",
    });

    const replyText = result.ok ? result.replyText : result.errors.join("\n");
    const replyResult = await replyLineText(
      command.replyToken,
      replyText,
      result.ok && result.pending
        ? {
            quickReplies: [
              { label: "確認送出", text: "確認送出" },
              { label: "取消", text: "取消" },
            ],
          }
        : undefined,
    );

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

async function handleBookingInput(messageText: string, adminUserId: string) {
  const normalizedText = normalizeBookingInput(messageText);

  if (!/^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/.test(normalizedText)) return null;

  const adminError = verifyLineAdminUserId(adminUserId);

  if (adminError) {
    const body = await adminError.json();
    const errors = Array.isArray(body.errors) ? body.errors : ["操作者驗證失敗"];
    return { ok: false, replyText: errors.join("\n"), errors, quickReplies: [] };
  }

  const parsed = parseBookingInput(normalizedText);

  if (!parsed.ok) {
    return {
      ok: false,
      replyText: parsed.error,
      errors: [parsed.error],
      quickReplies: [{ label: "返回", text: "返回" }],
    };
  }

  const student = await getStudentByShareToken(yiNingPackagePlan.shareToken);

  if (!student) {
    const errors = ["找不到學生資料，無法新增預約"];
    return { ok: false, replyText: errors[0], errors, quickReplies: [] };
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("student_id", student.id)
    .eq("session_date", parsed.data.sessionDate)
    .eq("session_time", parsed.data.sessionTime)
    .eq("status", "scheduled")
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      replyText: existingError.message,
      errors: [existingError.message],
      quickReplies: [],
    };
  }

  if (existing) {
    const errors = ["這個日期與時間已有預約，沒有重複新增。"];
    return {
      ok: false,
      replyText: errors[0],
      errors,
      quickReplies: [
        { label: "課程", text: "課程" },
        { label: "返回", text: "返回" },
      ],
    };
  }

  const { error } = await supabase.from("class_sessions").insert({
    student_id: student.id,
    session_date: parsed.data.sessionDate,
    session_time: parsed.data.sessionTime,
    title: "預約課程",
    status: "scheduled",
    content: null,
    notes: "由 LINE Bot 新增",
    counts_toward_used_sessions: false,
  });

  if (error) {
    return {
      ok: false,
      replyText: error.message,
      errors: [error.message],
      quickReplies: [],
    };
  }

  return {
    ok: true,
    replyText: [
      "預約已新增",
      "",
      `日期：${parsed.data.displayDate}`,
      `時間：${parsed.data.displayTime}`,
      "",
      "學生端已同步更新。",
    ].join("\n"),
    errors: [],
    quickReplies: [
      { label: "課程", text: "課程" },
      { label: "返回", text: "返回" },
    ],
  };
}

async function handlePendingAction(messageText: string, adminUserId: string) {
  const normalizedText = messageText.trim();
  const isConfirm = ["確認送出", "確認"].includes(normalizedText);
  const isCancel = ["取消"].includes(normalizedText);

  if (!isConfirm && !isCancel) return null;

  const adminError = verifyLineAdminUserId(adminUserId);

  if (adminError) {
    const body = await adminError.json();
    const errors = Array.isArray(body.errors) ? body.errors : ["操作者驗證失敗"];
    return { ok: false, replyText: errors.join("\n"), errors };
  }

  const student = await getStudentByShareToken(yiNingPackagePlan.shareToken);

  if (!student) {
    const errors = ["找不到學生資料"];
    return { ok: false, replyText: errors[0], errors };
  }

  const latestResult = await findLatestPendingRedemption(student.id);

  if (!latestResult.ok) {
    return {
      ok: false,
      replyText: latestResult.errors.join("\n"),
      errors: latestResult.errors,
    };
  }

  if (!latestResult.pending) {
    const errors = ["目前沒有等待確認的領取紀錄。請先輸入日期與商品。"];
    return { ok: false, replyText: errors[0], errors };
  }

  const actionResult = isConfirm
    ? await confirmPendingRedemption(latestResult.pending.id)
    : await cancelPendingRedemption(latestResult.pending.id);

  if (!actionResult.ok) {
    return {
      ok: false,
      replyText: actionResult.errors.join("\n"),
      errors: actionResult.errors,
    };
  }

  if (actionResult.status === "cancelled") {
    return {
      ok: true,
      replyText: "已取消這筆領取紀錄，沒有扣除組數。\n\n輸入「保健食品」可重新新增，輸入「返回」回到裔甯選單。",
      errors: [],
    };
  }

  return {
    ok: true,
    replyText: [
      "領取紀錄已送出",
      "",
      `日期：${formatDisplayDate(actionResult.date)}`,
      `扣除：${actionResult.creditUsed} 組`,
      `商品總數：${actionResult.totalBoxes} 盒`,
      "",
      "學生端已同步更新。",
      "輸入「返回」回到裔甯選單。",
    ].join("\n"),
    errors: [],
  };
}

function formatDisplayDate(date?: string) {
  if (!date) return "";
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
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

async function buildLineMenuResponse(messageText: string, adminUserId: string) {
  const normalizedText = messageText.trim();
  const menuKeywords = ["裔甯", "邱裔甯", "選單", "返回"];
  const linkKeywords = ["學生端連結", "學生連結", "連結"];
  const supplementKeywords = ["保健食品", "領取", "新增領取紀錄"];
  const courseKeywords = ["課程"];
  const newBookingKeywords = ["新增預約"];
  const paymentKeywords = ["繳費", "付款"];

  const isMenuCommand = [
    ...menuKeywords,
    ...linkKeywords,
    ...supplementKeywords,
    ...courseKeywords,
    ...newBookingKeywords,
    ...paymentKeywords,
  ].includes(normalizedText);

  if (!isMenuCommand) return null;

  const adminError = verifyLineAdminUserId(adminUserId);

  if (adminError) {
    const body = await adminError.json();
    return {
      ok: false,
      replyText: Array.isArray(body.errors) ? body.errors.join("\n") : "操作者驗證失敗",
      errors: Array.isArray(body.errors) ? body.errors : ["操作者驗證失敗"],
      quickReplies: [],
    };
  }

  if (menuKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: [
        "裔甯管理選單",
        "",
        "請輸入其中一項：",
        "課程",
        "繳費",
        "保健食品",
        "學生端連結",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "課程", text: "課程" },
        { label: "繳費", text: "繳費" },
        { label: "保健食品", text: "保健食品" },
        { label: "學生端連結", text: "學生端連結" },
      ],
    };
  }

  if (linkKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: `${getPublicSiteUrl()}/s/${yiNingPackagePlan.shareToken}`,
      errors: [],
      quickReplies: [],
    };
  }

  if (supplementKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: [
        "新增保健食品領取紀錄，請直接輸入：",
        "",
        "7/1",
        "B群 1組",
        "D 1組",
        "白賦美 1組",
        "",
        "同一筆可以包含一般品項與任搭。",
      ].join("\n"),
      errors: [],
      quickReplies: [],
    };
  }

  if (courseKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: "裔甯課程管理\n\n請選擇操作：",
      errors: [],
      quickReplies: [
        { label: "新增預約", text: "新增預約" },
        { label: "完成課程", text: "完成課程" },
        { label: "取消課程", text: "取消課程" },
        { label: "返回", text: "返回" },
      ],
    };
  }

  if (newBookingKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: ["請輸入預約日期與時間：", "", "範例：７／１５　１８：３０", "", "全形、半形皆可。"].join("\n"),
      errors: [],
      quickReplies: [{ label: "返回", text: "返回" }],
    };
  }

  return {
    ok: true,
    replyText: "繳費操作下一步會接上：登記已繳、改回未繳。",
    errors: [],
    quickReplies: [],
  };
}

function getPublicSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://student-health-redemption.vercel.app").replace(/\/$/, "");
}
