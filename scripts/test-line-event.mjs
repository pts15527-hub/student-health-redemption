import crypto from "node:crypto";
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
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "local-test-channel-secret";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function cleanup() {
  await supabase.from("redemption_records").delete().like("notes", "[TEST] LINE pending confirmation%");
  await supabase.from("pending_redemptions").delete().eq("is_test", true);
}

function sign(body) {
  return crypto.createHmac("sha256", channelSecret).update(body, "utf8").digest("base64");
}

await cleanup();

try {
  const rawBody = JSON.stringify({
    events: [
      {
        type: "message",
        replyToken: "test-reply-token",
        source: {
          type: "user",
          userId: "local-test-admin",
        },
        message: {
          type: "text",
          id: "test-message-id",
          text: "7/1\nB群 1組\nD 1組\n白賦美 1組",
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

  const body = await response.json();

  if (!response.ok || body.ok !== true || body.handled !== 1) {
    console.error(JSON.stringify(body, null, 2));
    throw new Error(`LINE event test failed with HTTP ${response.status}`);
  }

  const reply = body.replies?.[0];

  if (!reply?.reply?.dryRun || reply.reply.payload.replyToken !== "test-reply-token") {
    console.error(JSON.stringify(body, null, 2));
    throw new Error("LINE event reply dry-run payload was not returned as expected.");
  }

  if (!reply.pending?.id) {
    console.error(JSON.stringify(body, null, 2));
    throw new Error("LINE event did not create a test pending redemption.");
  }

  const quickReplyItems = reply.reply.payload.messages[0]?.quickReply?.items ?? [];
  const quickReplyLabels = quickReplyItems.map((item) => item.action?.label);

  if (!quickReplyLabels.includes("確認送出") || !quickReplyLabels.includes("取消")) {
    console.error(JSON.stringify(body, null, 2));
    throw new Error("LINE event reply did not include confirmation and cancellation buttons.");
  }

  const { data: pending, error } = await supabase
    .from("pending_redemptions")
    .select("id, source, is_test")
    .eq("id", reply.pending.id)
    .single();

  if (error || pending?.source !== "line-event" || pending?.is_test !== true) {
    console.error(error?.message ?? pending);
    throw new Error("LINE event pending redemption was not stored correctly.");
  }

  console.log("LINE event test OK");
  console.log(JSON.stringify({ handled: body.handled, pending: reply.pending, reply: reply.reply }, null, 2));
} finally {
  await cleanup();
}
