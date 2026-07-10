import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const endpoint = process.env.LINE_WEBHOOK_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook";
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "local-test-channel-secret";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminUserId = "local-test-admin";
const alias = `付款測試${suffix}`;
let studentId;

function sign(body) {
  return crypto.createHmac("sha256", channelSecret).update(body, "utf8").digest("base64");
}

async function sendLineText(text) {
  const rawBody = JSON.stringify({
    events: [
      {
        type: "message",
        replyToken: `test-${crypto.randomUUID()}`,
        source: {
          type: "user",
          userId: adminUserId,
        },
        message: {
          type: "text",
          id: crypto.randomUUID(),
          text,
        },
      },
    ],
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": sign(rawBody),
    },
    body: rawBody,
  });

  return { response, body: await response.json() };
}

function firstReplyText(result) {
  return result.body.replies?.[0]?.reply?.payload?.messages?.[0]?.text ?? "";
}

try {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      share_token: `payment-context-${suffix}`,
      name: "付款流程測試",
      project_name: "Temporary payment context test",
    })
    .select("id")
    .single();

  if (studentError || !student) throw new Error(studentError?.message ?? "Failed to create test student.");
  studentId = student.id;

  const { error: aliasError } = await supabase.from("student_aliases").insert({
    student_id: studentId,
    alias_key: alias,
    alias_display: alias,
  });
  if (aliasError) throw new Error(aliasError.message);

  const { error: paymentError } = await supabase.from("payment_records").insert({
    student_id: studentId,
    installment_no: 1,
    due_date: "2026-06-20",
    amount: 16000,
    status: "unpaid",
  });
  if (paymentError) throw new Error(paymentError.message);

  const selectedStudent = await sendLineText(alias);
  if (!selectedStudent.response.ok || !firstReplyText(selectedStudent).includes("管理選單")) {
    console.error(JSON.stringify(selectedStudent.body, null, 2));
    throw new Error("Failed to select payment context test student.");
  }

  const selectedPayment = await sendLineText("選擇繳費 第1期");
  const selectedPaymentText = firstReplyText(selectedPayment);
  if (!selectedPayment.response.ok || !selectedPaymentText.includes("登記第 1 期繳費")) {
    console.error(JSON.stringify(selectedPayment.body, null, 2));
    throw new Error("Failed to enter pending payment date state.");
  }

  const paidByDateOnly = await sendLineText("6/20");
  const paidByDateOnlyText = firstReplyText(paidByDateOnly);
  if (
    !paidByDateOnly.response.ok ||
    !paidByDateOnlyText.includes("繳費已登記") ||
    paidByDateOnlyText.includes("沒有讀到任何領取品項")
  ) {
    console.error(JSON.stringify(paidByDateOnly.body, null, 2));
    throw new Error("Date-only payment input was not handled by pending payment context.");
  }

  const { data: paymentRecord, error: recordError } = await supabase
    .from("payment_records")
    .select("status, paid_date")
    .eq("student_id", studentId)
    .eq("installment_no", 1)
    .single();

  if (recordError || paymentRecord?.status !== "paid" || paymentRecord?.paid_date !== "2026-06-20") {
    throw new Error(recordError?.message ?? `Unexpected payment record: ${JSON.stringify(paymentRecord)}`);
  }

  console.log("LINE payment context test OK");
} finally {
  await supabase.from("line_admin_contexts").delete().eq("admin_user_id", adminUserId);
  if (studentId) await supabase.from("students").delete().eq("id", studentId);
}
