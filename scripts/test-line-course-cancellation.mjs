import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  const envFile = readFileSync(".env.local", "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const endpoint = process.env.LINE_WEBHOOK_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const testNote = "[TEST] LINE course cancellation";

async function cleanup() {
  await supabase.from("class_sessions").delete().eq("notes", testNote);
}

await cleanup();

try {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("share_token", "yi-ning")
    .single();

  if (studentError || !student) {
    throw new Error(studentError?.message ?? "Student not found.");
  }

  const { data: session, error: insertError } = await supabase
    .from("class_sessions")
    .insert({
      student_id: student.id,
      session_date: "2026-12-30",
      session_time: "23:58:00",
      title: "預約課程",
      status: "scheduled",
      notes: testNote,
      counts_toward_used_sessions: false,
    })
    .select("id")
    .single();

  if (insertError || !session) {
    throw new Error(insertError?.message ?? "Failed to create test session.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: "test-course-cancellation",
          source: { userId: "local-test-admin" },
          message: { type: "text", text: "確認取消課程 12/30 23:58" },
        },
      ],
    }),
  });
  const body = await response.json();

  if (!response.ok || body.replies?.[0]?.ok !== true) {
    throw new Error(`Course cancellation failed: ${JSON.stringify(body)}`);
  }

  const cancellationLabels = (
    body.replies[0].reply.payload.messages[0]?.quickReply?.items ?? []
  ).map((item) => item.action?.label);

  if (!["課程", "返回", "結束"].every((label) => cancellationLabels.includes(label))) {
    throw new Error(`Course cancellation actions are incomplete: ${JSON.stringify(cancellationLabels)}`);
  }

  const { data: cancelled, error: cancelledError } = await supabase
    .from("class_sessions")
    .select("status, counts_toward_used_sessions")
    .eq("id", session.id)
    .single();

  if (
    cancelledError ||
    cancelled?.status !== "cancelled" ||
    cancelled?.counts_toward_used_sessions !== false
  ) {
    throw new Error(cancelledError?.message ?? `Unexpected cancelled session: ${JSON.stringify(cancelled)}`);
  }

  console.log("LINE course cancellation test OK");
  console.log(body.replies[0].reply.payload.messages[0].text);
} finally {
  await cleanup();
}
