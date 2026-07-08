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

async function cleanup() {
  await supabase.from("redemption_records").delete().like("notes", "[TEST] LINE pending confirmation%");
  await supabase.from("pending_redemptions").delete().eq("is_test", true);
}

async function createPending() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      shareToken: "yi-ning",
      messageText: "7/1\nB群 1組\nD 1組\n白賦美 1組",
      persistPending: true,
      isTest: true,
      adminUserId: "local-test-admin",
    }),
  });
  const body = await response.json();

  if (!response.ok || !body.pending?.id) {
    throw new Error(`Pending creation failed: ${JSON.stringify(body)}`);
  }

  return body.pending.id;
}

async function sendLineCommand(text) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: `test-${text}`,
          source: { userId: "local-test-admin" },
          message: { type: "text", text },
        },
      ],
    }),
  });
  const body = await response.json();

  if (!response.ok || body.replies?.[0]?.ok !== true) {
    throw new Error(`LINE ${text} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

await cleanup();

try {
  const confirmPendingId = await createPending();
  const confirmReply = await sendLineCommand("確認送出");
  const { data: confirmed } = await supabase
    .from("pending_redemptions")
    .select("status")
    .eq("id", confirmPendingId)
    .single();

  if (confirmed?.status !== "confirmed") {
    throw new Error("LINE confirmation did not confirm the latest pending record.");
  }

  const cancelPendingId = await createPending();
  const cancelReply = await sendLineCommand("取消");
  const { data: cancelled } = await supabase
    .from("pending_redemptions")
    .select("status")
    .eq("id", cancelPendingId)
    .single();

  if (cancelled?.status !== "cancelled") {
    throw new Error("LINE cancellation did not cancel the latest pending record.");
  }

  console.log("LINE pending action test OK");
  console.log(
    JSON.stringify(
      {
        confirmReply: confirmReply.replies[0].reply.payload.messages[0].text,
        cancelReply: cancelReply.replies[0].reply.payload.messages[0].text,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
}
