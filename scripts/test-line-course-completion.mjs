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
const testNote = "[TEST] LINE course completion";

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
      session_date: "2026-12-31",
      session_time: "23:59:00",
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
          replyToken: "test-course-completion",
          source: { userId: "local-test-admin" },
          message: { type: "text", text: "確認完成課程 12/31 23:59 訓練" },
        },
      ],
    }),
  });
  const body = await response.json();

  if (!response.ok || body.replies?.[0]?.ok !== true) {
    throw new Error(`Course completion failed: ${JSON.stringify(body)}`);
  }

  const completionLabels = (
    body.replies[0].reply.payload.messages[0]?.quickReply?.items ?? []
  ).map((item) => item.action?.label);

  if (!["課程", "返回", "結束"].every((label) => completionLabels.includes(label))) {
    throw new Error(`Course completion actions are incomplete: ${JSON.stringify(completionLabels)}`);
  }

  const { data: completed, error: completedError } = await supabase
    .from("class_sessions")
    .select("status, title, counts_toward_used_sessions")
    .eq("id", session.id)
    .single();

  if (
    completedError ||
    completed?.status !== "completed" ||
    completed?.title !== "訓練" ||
    completed?.counts_toward_used_sessions !== true
  ) {
    throw new Error(completedError?.message ?? `Unexpected completed session: ${JSON.stringify(completed)}`);
  }

  console.log("LINE course completion test OK");
  console.log(body.replies[0].reply.payload.messages[0].text);
} finally {
  await cleanup();
}
