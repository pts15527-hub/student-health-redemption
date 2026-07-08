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

const webhookEndpoint = process.env.LINE_WEBHOOK_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook";
const confirmEndpoint = process.env.LINE_CONFIRM_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook/confirm";
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

await cleanup();

try {
  const pendingResponse = await fetch(webhookEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      shareToken: "yi-ning",
      messageText: "7/1\nB群 1組\nD 1組\n白賦美 1組",
      persistPending: true,
      isTest: true,
      adminUserId: "local-test-admin",
    }),
  });

  const pendingBody = await pendingResponse.json();

  if (!pendingResponse.ok || pendingBody.ok !== true || !pendingBody.pending?.id) {
    console.error(JSON.stringify(pendingBody, null, 2));
    throw new Error(`Pending creation failed with HTTP ${pendingResponse.status}`);
  }

  const confirmResponse = await fetch(confirmEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      pendingId: pendingBody.pending.id,
      testMode: true,
      adminUserId: "local-test-admin",
    }),
  });

  const confirmBody = await confirmResponse.json();

  if (!confirmResponse.ok || confirmBody.ok !== true || !confirmBody.recordId) {
    console.error(JSON.stringify(confirmBody, null, 2));
    throw new Error(`Confirm failed with HTTP ${confirmResponse.status}`);
  }

  if (confirmBody.creditUsed !== 3 || confirmBody.totalBoxes !== 11 || confirmBody.itemCount !== 3) {
    console.error(JSON.stringify(confirmBody, null, 2));
    throw new Error("Confirm summary did not match expected creditUsed=3, totalBoxes=11, itemCount=3");
  }

  const { data: pendingAfterConfirm, error: pendingError } = await supabase
    .from("pending_redemptions")
    .select("status")
    .eq("id", pendingBody.pending.id)
    .single();

  if (pendingError || pendingAfterConfirm?.status !== "confirmed") {
    console.error(pendingError?.message ?? pendingAfterConfirm);
    throw new Error("Pending status was not confirmed.");
  }

  console.log("LINE confirm test OK");
  console.log(JSON.stringify(confirmBody, null, 2));
} finally {
  await cleanup();
}
