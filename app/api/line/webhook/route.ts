import { NextResponse } from "next/server";

import { verifyLineAdminUserId } from "@/lib/line/admin-auth";
import { normalizeBookingInput, parseBookingInput } from "@/lib/line/course-booking";
import { extractLineTextCommands, isLineWebhookBody } from "@/lib/line/events";
import {
  cancelPendingRedemption,
  confirmPendingRedemption,
  findLatestPendingRedemption,
} from "@/lib/line/pending-redemptions";
import {
  getLinePaymentRecord,
  listLinePaymentRecords,
  markLinePaymentPaid,
  markLinePaymentUnpaid,
} from "@/lib/line/payment-management";
import { parseRedemptionMessage } from "@/lib/line/redemption-parser";
import { replyLineText } from "@/lib/line/reply";
import { verifyLineSignatureGuard } from "@/lib/line/signature";
import {
  clearPendingLineAction,
  clearActiveLineStudent,
  findStudentByAlias,
  getActiveLineStudent,
  getLineAdminContext,
  setActiveLineStudent,
  setPendingPaymentDateInput,
  type LineAdminContext,
} from "@/lib/line/student-context";
import { loadStudentRedemptionPlan } from "@/lib/line/student-redemption-plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { yiNingPackagePlan } from "@/src/data/students/yi-ning";
import type { Student } from "@/types/domain";

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
    const contextResult = await handleStudentContextCommand(command.messageText, command.adminUserId);

    if (contextResult) {
      const replyResult = await replyLineText(command.replyToken, contextResult.replyText, {
        quickReplies: contextResult.quickReplies,
      });

      replies.push({
        ok: contextResult.ok,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: contextResult.ok ? [] : contextResult.errors,
      });

      continue;
    }

    const activeContext = await getLineAdminContext(command.adminUserId);
    const activeStudent = activeContext?.student ?? null;

    if (!activeStudent) {
      const replyText = "請先輸入學生名字，例如「裔甯」。";
      const replyResult = await replyLineText(command.replyToken, replyText);
      replies.push({
        ok: false,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: [replyText],
      });
      continue;
    }

    const pendingContextResult = await handlePendingLineContextInput(
      command.messageText,
      command.adminUserId,
      activeContext,
    );

    if (pendingContextResult) {
      const replyResult = await replyLineText(command.replyToken, pendingContextResult.replyText, {
        quickReplies: pendingContextResult.quickReplies,
      });

      replies.push({
        ok: pendingContextResult.ok,
        replyToken: command.replyToken,
        reply: replyResult,
        pending: null,
        errors: pendingContextResult.ok ? [] : pendingContextResult.errors,
      });

      continue;
    }

    const bookingResult = await handleBookingInput(command.messageText, command.adminUserId, activeStudent);

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

    const pendingActionResult = await handlePendingAction(command.messageText, command.adminUserId, activeStudent);

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

    const menuResult = await buildLineMenuResponse(command.messageText, command.adminUserId, activeStudent);

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
      shareToken: activeStudent.share_token,
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

async function handleStudentContextCommand(messageText: string, adminUserId: string) {
  const normalizedText = normalizeBookingInput(messageText);
  const adminError = verifyLineAdminUserId(adminUserId);

  if (adminError) {
    const body = await adminError.json();
    const errors = Array.isArray(body.errors) ? body.errors : ["操作者驗證失敗"];
    return { ok: false, replyText: errors.join("\n"), errors, quickReplies: [] };
  }

  if (normalizedText === "結束") {
    const activeStudent = await getActiveLineStudent(adminUserId);
    const error = await clearActiveLineStudent(adminUserId);
    if (error) return lineMenuError(error.message);

    return {
      ok: true,
      replyText: activeStudent
        ? `已結束${activeStudent.name}管理。\n需要時再輸入學生名字即可開啟管理選單。`
        : "目前沒有正在管理的學生。",
      errors: [],
      quickReplies: [],
    };
  }

  const matched = await findStudentByAlias(normalizedText);
  if (!matched) return null;

  const error = await setActiveLineStudent(adminUserId, matched.student.id);
  if (error) return lineMenuError(error.message);

  return buildStudentMainMenu(matched.student);
}

async function handleBookingInput(messageText: string, adminUserId: string, student: Student) {
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

async function handlePendingLineContextInput(
  messageText: string,
  adminUserId: string,
  context: LineAdminContext | null,
) {
  if (!context || context.pendingAction !== "payment_date_input") return null;

  const normalizedText = normalizeBookingInput(messageText);
  if (isMenuNavigationText(normalizedText)) return null;

  const installmentNo = readPendingInstallmentNo(context.pendingPayload);
  if (!installmentNo) {
    await clearPendingLineAction(adminUserId);
    return lineMenuError("繳費暫存狀態不完整，請重新開啟繳費選單。");
  }

  const dateTextResult = extractPaymentDateText(normalizedText, installmentNo);

  if (!dateTextResult.ok) {
    return {
      ok: false,
      replyText: dateTextResult.error,
      errors: [dateTextResult.error],
      quickReplies: [
        { label: "繳費", text: "繳費" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  const parsedDate = parseBookingInput(`${dateTextResult.dateText} 00:00`);

  if (!parsedDate.ok) {
    return {
      ok: false,
      replyText: `日期格式看不懂，請重新輸入第 ${installmentNo} 期繳費日，例如：6/20`,
      errors: [parsedDate.error],
      quickReplies: [
        { label: "繳費", text: "繳費" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  const result = await markPaymentInstallmentPaid(context.student, installmentNo, parsedDate.data.sessionDate);

  if (!result.ok) return result;

  const clearError = await clearPendingLineAction(adminUserId);
  if (clearError) return lineMenuError(clearError.message);

  return {
    ok: true,
    replyText: [
      "繳費已登記",
      "",
      `期數：第 ${installmentNo} 期`,
      `繳費日：${parsedDate.data.displayDate}`,
      "",
      "學生端已同步更新。",
    ].join("\n"),
    errors: [],
    quickReplies: [
      { label: "繳費", text: "繳費" },
      { label: "課程", text: "課程" },
      { label: "返回", text: "返回" },
      { label: "結束", text: "結束" },
    ],
  };
}

async function handlePendingAction(messageText: string, adminUserId: string, student: Student) {
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
      replyText: `已取消這筆領取紀錄，沒有扣除組數。\n\n輸入「保健食品」可重新新增，輸入「返回」回到${student.name}選單。`,
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
      `輸入「返回」回到${student.name}選單。`,
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

  if (typeof input.shareToken !== "string") {
    return {
      ok: false,
      errors: ["shareToken 必須是非空白文字"],
      status: 400,
    };
  }

  const planResult = await loadStudentRedemptionPlan(input.shareToken);
  if (!planResult.ok) {
    return {
      ok: false,
      errors: planResult.errors,
      status: 404,
    };
  }

  const parsed = parseRedemptionMessage(input.messageText, planResult.plan);

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

    const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000).toISOString();
    const supabase = createSupabaseServerClient();
    const { data: pending, error } = await supabase
      .from("pending_redemptions")
      .insert({
        student_id: planResult.student.id,
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

async function buildLineMenuResponse(messageText: string, adminUserId: string, student: Student) {
  const normalizedText = normalizeBookingInput(messageText);
  const selectedCompletionMatch = normalizedText.match(
    /^選擇完成課程\s+(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})$/,
  );
  const confirmedCompletionMatch = normalizedText.match(
    /^確認完成課程\s+(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})\s+(訓練|矯正)$/,
  );
  const confirmedCancellationMatch = normalizedText.match(
    /^確認取消課程\s+(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})$/,
  );
  const selectedPaymentMatch = normalizedText.match(/^選擇繳費\s+第(\d+)期$/);
  const paymentEntryMatch = normalizedText.match(/^第(\d+)期\s+(\d{1,2}\/\d{1,2})$/);
  const markUnpaidMatch = normalizedText.match(/^改回未繳\s+第(\d+)期$/);
  const menuKeywords = ["選單", "返回"];
  const linkKeywords = ["學生端連結", "學生連結", "連結"];
  const supplementKeywords = ["保健食品", "領取", "新增領取紀錄"];
  const courseKeywords = ["課程"];
  const newBookingKeywords = ["新增預約"];
  const completeCourseKeywords = ["完成課程"];
  const cancelCourseKeywords = ["取消課程"];
  const paymentKeywords = ["繳費", "付款"];

  const isMenuCommand =
    Boolean(selectedCompletionMatch) ||
    Boolean(confirmedCompletionMatch) ||
    Boolean(confirmedCancellationMatch) ||
    Boolean(selectedPaymentMatch) ||
    Boolean(paymentEntryMatch) ||
    Boolean(markUnpaidMatch) ||
    [
    ...menuKeywords,
    ...linkKeywords,
    ...supplementKeywords,
    ...courseKeywords,
    ...newBookingKeywords,
    ...completeCourseKeywords,
    ...cancelCourseKeywords,
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
    const clearError = await clearPendingLineAction(adminUserId);
    if (clearError) return lineMenuError(clearError.message);
    return buildStudentMainMenu(student);
  }

  if (linkKeywords.includes(normalizedText)) {
    return {
      ok: true,
      replyText: `${getPublicSiteUrl()}/s/${student.share_token}`,
      errors: [],
      quickReplies: [],
    };
  }

  if (supplementKeywords.includes(normalizedText)) {
    const clearError = await clearPendingLineAction(adminUserId);
    if (clearError) return lineMenuError(clearError.message);

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
    const clearError = await clearPendingLineAction(adminUserId);
    if (clearError) return lineMenuError(clearError.message);

    return {
      ok: true,
      replyText: `${student.name}課程管理\n\n請選擇操作：`,
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

  if (completeCourseKeywords.includes(normalizedText)) {
    const supabase = createSupabaseServerClient();
    const { data: scheduled, error } = await supabase
      .from("class_sessions")
      .select("session_date, session_time")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .order("session_date", { ascending: true })
      .order("session_time", { ascending: true })
      .limit(10);

    if (error) {
      return {
        ok: false,
        replyText: error.message,
        errors: [error.message],
        quickReplies: [],
      };
    }

    if (!scheduled?.length) {
      return {
        ok: true,
        replyText: "目前沒有可完成的已預約課程。",
        errors: [],
        quickReplies: [
          { label: "課程", text: "課程" },
          { label: "返回", text: "返回" },
        ],
      };
    }

    return {
      ok: true,
      replyText: "請選擇要完成的課程：",
      errors: [],
      quickReplies: [
        ...scheduled.map((session) => {
          const label = formatSessionChoice(session.session_date, session.session_time);
          return {
            label,
            text: `選擇完成課程 ${label}`,
          };
        }),
        { label: "返回", text: "返回" },
      ],
    };
  }

  if (cancelCourseKeywords.includes(normalizedText)) {
    const scheduledResult = await getScheduledSessionChoices(student);

    if (!scheduledResult.ok) {
      return {
        ok: false,
        replyText: scheduledResult.errors.join("\n"),
        errors: scheduledResult.errors,
        quickReplies: [],
      };
    }

    if (!scheduledResult.sessions.length) {
      return {
        ok: true,
        replyText: "目前沒有可取消的已預約課程。",
        errors: [],
        quickReplies: [
          { label: "課程", text: "課程" },
          { label: "返回", text: "返回" },
        ],
      };
    }

    return {
      ok: true,
      replyText: "請選擇要取消的課程：\n\n點選時段後會直接取消，不扣堂數。",
      errors: [],
      quickReplies: [
        ...scheduledResult.sessions.map((session) => {
          const label = formatSessionChoice(session.session_date, session.session_time);
          return {
            label,
            text: `確認取消課程 ${label}`,
          };
        }),
        { label: "返回", text: "返回" },
      ],
    };
  }

  if (selectedCompletionMatch) {
    const parsed = parseBookingInput(selectedCompletionMatch[1]);

    if (!parsed.ok) {
      return {
        ok: false,
        replyText: parsed.error,
        errors: [parsed.error],
        quickReplies: [{ label: "返回", text: "返回" }],
      };
    }

    const supabase = createSupabaseServerClient();
    const { data: session, error } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("student_id", student.id)
      .eq("session_date", parsed.data.sessionDate)
      .eq("session_time", parsed.data.sessionTime)
      .eq("status", "scheduled")
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        replyText: error.message,
        errors: [error.message],
        quickReplies: [],
      };
    }

    if (!session) {
      return {
        ok: false,
        replyText: "找不到這堂已預約課程，可能已被完成或取消。",
        errors: ["找不到這堂已預約課程"],
        quickReplies: [
          { label: "完成課程", text: "完成課程" },
          { label: "返回", text: "返回" },
        ],
      };
    }

    const sessionLabel = `${parsed.data.displayDate} ${parsed.data.displayTime}`;

    return {
      ok: true,
      replyText: [`已選擇：${sessionLabel}`, "", "請選擇這堂課的類型："].join("\n"),
      errors: [],
      quickReplies: [
        { label: "訓練", text: `確認完成課程 ${sessionLabel} 訓練` },
        { label: "矯正", text: `確認完成課程 ${sessionLabel} 矯正` },
        { label: "返回", text: "返回" },
      ],
    };
  }

  if (confirmedCompletionMatch) {
    const parsed = parseBookingInput(confirmedCompletionMatch[1]);
    const courseType = confirmedCompletionMatch[2];

    if (!parsed.ok) {
      return {
        ok: false,
        replyText: parsed.error,
        errors: [parsed.error],
        quickReplies: [{ label: "返回", text: "返回" }],
      };
    }

    const supabase = createSupabaseServerClient();
    const { data: completedSession, error } = await supabase
      .from("class_sessions")
      .update({
        status: "completed",
        title: courseType,
        counts_toward_used_sessions: true,
      })
      .eq("student_id", student.id)
      .eq("session_date", parsed.data.sessionDate)
      .eq("session_time", parsed.data.sessionTime)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        replyText: error.message,
        errors: [error.message],
        quickReplies: [],
      };
    }

    if (!completedSession) {
      return {
        ok: false,
        replyText: "這堂課已被完成或取消，沒有重複扣除堂數。",
        errors: ["這堂課已被處理"],
        quickReplies: [
          { label: "課程", text: "課程" },
          { label: "返回", text: "返回" },
        ],
      };
    }

    return {
      ok: true,
      replyText: [
        "課程已完成",
        "",
        `日期：${parsed.data.displayDate}`,
        `時間：${parsed.data.displayTime}`,
        `類型：${courseType}`,
        "",
        "學生端已同步更新。",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "課程", text: "課程" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  if (confirmedCancellationMatch) {
    const parsed = parseBookingInput(confirmedCancellationMatch[1]);

    if (!parsed.ok) {
      return {
        ok: false,
        replyText: parsed.error,
        errors: [parsed.error],
        quickReplies: [{ label: "返回", text: "返回" }],
      };
    }

    const supabase = createSupabaseServerClient();
    const { data: cancelledSession, error } = await supabase
      .from("class_sessions")
      .update({
        status: "cancelled",
        counts_toward_used_sessions: false,
      })
      .eq("student_id", student.id)
      .eq("session_date", parsed.data.sessionDate)
      .eq("session_time", parsed.data.sessionTime)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        replyText: error.message,
        errors: [error.message],
        quickReplies: [],
      };
    }

    if (!cancelledSession) {
      return {
        ok: false,
        replyText: "這堂課已被完成或取消，沒有重複處理。",
        errors: ["這堂課已被處理"],
        quickReplies: [
          { label: "課程", text: "課程" },
          { label: "返回", text: "返回" },
        ],
      };
    }

    return {
      ok: true,
      replyText: [
        "課程已取消",
        "",
        `日期：${parsed.data.displayDate}`,
        `時間：${parsed.data.displayTime}`,
        "",
        "本次不扣堂數，學生端已同步更新。",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "課程", text: "課程" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  if (paymentKeywords.includes(normalizedText)) {
    const clearError = await clearPendingLineAction(adminUserId);
    if (clearError) return lineMenuError(clearError.message);

    const { data: records, error } = await listLinePaymentRecords(student.id);

    if (error) return lineMenuError(error.message);

    return {
      ok: true,
      replyText: [
        `${student.name}繳費管理`,
        "",
        "請選擇期數：",
        ...(records ?? []).map(
          (record) => `第 ${record.installment_no} 期｜${record.status === "paid" ? "已繳" : "未繳"}`,
        ),
      ].join("\n"),
      errors: [],
      quickReplies: [
        ...(records ?? []).map((record) => ({
          label: `第${record.installment_no}期 ${record.status === "paid" ? "已繳" : "未繳"}`,
          text: `選擇繳費 第${record.installment_no}期`,
        })),
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  if (selectedPaymentMatch) {
    const installmentNo = Number(selectedPaymentMatch[1]);

    const { data: record, error } = await getLinePaymentRecord(student.id, installmentNo);

    if (error) return lineMenuError(error.message);
    if (!record) return lineMenuError(`找不到第 ${installmentNo} 期繳費資料。`);

    if (record.status === "paid") {
      const clearError = await clearPendingLineAction(adminUserId);
      if (clearError) return lineMenuError(clearError.message);

      return {
        ok: true,
        replyText: [
          `第 ${installmentNo} 期已繳`,
          `繳費日：${formatPaymentDate(record.paid_date)}`,
          "",
          "可直接改回未繳，不需二次確認。",
        ].join("\n"),
        errors: [],
        quickReplies: [
          { label: "改回未繳", text: `改回未繳 第${installmentNo}期` },
          { label: "返回", text: "返回" },
          { label: "結束", text: "結束" },
        ],
      };
    }

    const pendingError = await setPendingPaymentDateInput(adminUserId, student.id, installmentNo);
    if (pendingError) return lineMenuError(pendingError.message);

    return {
      ok: true,
      replyText: [
        `登記第 ${installmentNo} 期繳費`,
        "",
        "請輸入期數與實際繳費日：",
        `第${installmentNo}期 ７／１０`,
        "",
        "全形、半形皆可；不會預設為今天。",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  if (paymentEntryMatch) {
    const installmentNo = Number(paymentEntryMatch[1]);
    const parsedDate = parseBookingInput(`${paymentEntryMatch[2]} 00:00`);

    if (!parsedDate.ok) return lineMenuError(parsedDate.error);

    const result = await markPaymentInstallmentPaid(student, installmentNo, parsedDate.data.sessionDate);
    if (!result.ok) return result;

    const clearError = await clearPendingLineAction(adminUserId);
    if (clearError) return lineMenuError(clearError.message);

    return {
      ok: true,
      replyText: [
        "繳費已登記",
        "",
        `期數：第 ${installmentNo} 期`,
        `繳費日：${parsedDate.data.displayDate}`,
        "",
        "學生端已同步更新。",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "繳費", text: "繳費" },
        { label: "課程", text: "課程" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  if (markUnpaidMatch) {
    const installmentNo = Number(markUnpaidMatch[1]);

    const { data: currentRecord, error: currentError } = await getLinePaymentRecord(
      student.id,
      installmentNo,
    );

    if (currentError) return lineMenuError(currentError.message);
    if (!currentRecord) return lineMenuError(`找不到第 ${installmentNo} 期繳費資料。`);
    if (currentRecord.status !== "paid") {
      return lineMenuError(`第 ${installmentNo} 期目前不是已繳，沒有重複修改。`);
    }

    const { data: record, error } = await markLinePaymentUnpaid(student.id, installmentNo);

    if (error) return lineMenuError(error.message);

    if (!record) {
      return lineMenuError(`第 ${installmentNo} 期狀態已變更，請重新開啟繳費選單。`);
    }

    return {
      ok: true,
      replyText: [
        "已改回未繳",
        "",
        `期數：第 ${installmentNo} 期`,
        "繳費日期已清除。",
        "",
        "學生端已同步更新。",
      ].join("\n"),
      errors: [],
      quickReplies: [
        { label: "繳費", text: "繳費" },
        { label: "課程", text: "課程" },
        { label: "返回", text: "返回" },
        { label: "結束", text: "結束" },
      ],
    };
  }

  return null;
}

async function markPaymentInstallmentPaid(student: Student, installmentNo: number, paidDate: string) {
  const { data: currentRecord, error: currentError } = await getLinePaymentRecord(student.id, installmentNo);

  if (currentError) return lineMenuError(currentError.message);
  if (!currentRecord) return lineMenuError(`找不到第 ${installmentNo} 期繳費資料。`);
  if (currentRecord.status === "paid") {
    return lineMenuError(`第 ${installmentNo} 期已經是已繳，沒有重複登記。`);
  }

  const { data: record, error } = await markLinePaymentPaid(student.id, installmentNo, paidDate);

  if (error) return lineMenuError(error.message);

  if (!record) {
    return lineMenuError(`第 ${installmentNo} 期狀態已變更，請重新開啟繳費選單。`);
  }

  return {
    ok: true as const,
    replyText: "",
    errors: [],
    quickReplies: [],
  };
}

function readPendingInstallmentNo(payload: Record<string, unknown> | null) {
  const value = payload?.installmentNo;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function extractPaymentDateText(normalizedText: string, pendingInstallmentNo: number) {
  const dateOnlyMatch = normalizedText.match(/^(\d{1,2}\/\d{1,2})$/);
  if (dateOnlyMatch) {
    return {
      ok: true as const,
      dateText: dateOnlyMatch[1],
    };
  }

  const installmentMatch = normalizedText.match(/^第?([0-9一二三四五六七八九十]+)期\s*(\d{1,2}\/\d{1,2})$/);
  if (installmentMatch) {
    const installmentNo = parseInstallmentNo(installmentMatch[1]);

    if (installmentNo !== pendingInstallmentNo) {
      return {
        ok: false as const,
        error: `目前正在登記第 ${pendingInstallmentNo} 期，請輸入第 ${pendingInstallmentNo} 期繳費日，例如：6/20`,
      };
    }

    return {
      ok: true as const,
      dateText: installmentMatch[2],
    };
  }

  return {
    ok: false as const,
    error: `日期格式看不懂，請重新輸入第 ${pendingInstallmentNo} 期繳費日，例如：6/20`,
  };
}

function parseInstallmentNo(raw: string) {
  if (/^\d+$/.test(raw)) return Number(raw);

  const values: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  if (raw === "十") return 10;
  if (raw.startsWith("十")) return 10 + (values[raw.slice(1)] ?? 0);
  if (raw.endsWith("十")) return (values[raw[0]] ?? 0) * 10;
  if (raw.includes("十")) {
    const [tens, ones] = raw.split("十");
    return (values[tens] ?? 0) * 10 + (values[ones] ?? 0);
  }

  return values[raw] ?? Number.NaN;
}

function isMenuNavigationText(normalizedText: string) {
  return (
    [
      "選單",
      "返回",
      "學生端連結",
      "學生連結",
      "連結",
      "保健食品",
      "領取",
      "新增領取紀錄",
      "課程",
      "新增預約",
      "完成課程",
      "取消課程",
      "繳費",
      "付款",
      "結束",
      "確認送出",
      "確認",
      "取消",
    ].includes(normalizedText) ||
    /^選擇繳費\s+第\d+期$/.test(normalizedText) ||
    /^改回未繳\s+第\d+期$/.test(normalizedText) ||
    /^選擇完成課程\s+/.test(normalizedText) ||
    /^確認完成課程\s+/.test(normalizedText) ||
    /^確認取消課程\s+/.test(normalizedText)
  );
}

async function getScheduledSessionChoices(student: Student) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("class_sessions")
    .select("session_date, session_time")
    .eq("student_id", student.id)
    .eq("status", "scheduled")
    .order("session_date", { ascending: true })
    .order("session_time", { ascending: true })
    .limit(10);

  if (error) {
    return {
      ok: false as const,
      errors: [error.message],
    };
  }

  return {
    ok: true as const,
    sessions: data ?? [],
  };
}

function formatSessionChoice(date: string, time: string | null) {
  const [, month, day] = date.split("-");
  const displayTime = time ? time.slice(0, 5) : "未定";
  return `${Number(month)}/${Number(day)} ${displayTime}`;
}

function formatPaymentDate(date: string | null) {
  if (!date) return "未記錄";
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function lineMenuError(message: string) {
  return {
    ok: false,
    replyText: message,
    errors: [message],
    quickReplies: [
      { label: "返回", text: "返回" },
      { label: "結束", text: "結束" },
    ],
  };
}

function buildStudentMainMenu(student: Student) {
  return {
    ok: true,
    replyText: [
      `${student.name}管理選單`,
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

function getPublicSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://student-health-redemption.vercel.app").replace(/\/$/, "");
}
