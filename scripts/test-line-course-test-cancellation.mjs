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
const testNote = "[TEST] LINE course test cancellation";
const adminUserId = "local-test-admin";

async function sendLineText(text, replyToken) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken,
          source: { userId: adminUserId },
          message: { type: "text", text },
        },
      ],
    }),
  });
  return { response, body: await response.json() };
}

async function cleanup() {
  await supabase.from("class_sessions").delete().eq("notes", testNote);
  await supabase.from("line_admin_contexts").delete().eq("admin_user_id", adminUserId);
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
      session_date: "2026-12-29",
      session_time: "23:57:00",
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

  const { error: contextError } = await supabase.from("line_admin_contexts").upsert(
    {
      admin_user_id: adminUserId,
      active_student_id: student.id,
      pending_action: null,
      pending_payload: null,
      selected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "admin_user_id" },
  );

  if (contextError) {
    throw new Error(contextError.message);
  }

  const { response, body } = await sendLineText(
    "確認數據測試取消課程 12/29 23:57",
    "test-course-test-cancellation",
  );

  if (!response.ok || body.replies?.[0]?.ok !== true) {
    throw new Error(`Test course cancellation failed: ${JSON.stringify(body)}`);
  }

  const labels = (body.replies[0].reply.payload.messages[0]?.quickReply?.items ?? []).map(
    (item) => item.action?.label,
  );

  if (!["課程", "返回", "結束"].every((label) => labels.includes(label))) {
    throw new Error(`Test course cancellation actions are incomplete: ${JSON.stringify(labels)}`);
  }

  const { data: remaining, error: remainingError } = await supabase
    .from("class_sessions")
    .select("id, status")
    .eq("id", session.id)
    .maybeSingle();

  if (remainingError || remaining) {
    throw new Error(remainingError?.message ?? `Test session should be deleted: ${JSON.stringify(remaining)}`);
  }

  console.log("LINE course test cancellation test OK");
  console.log(body.replies[0].reply.payload.messages[0].text);
} finally {
  await cleanup();
}
