import crypto from "node:crypto";
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

function sign(body) {
  return crypto.createHmac("sha256", channelSecret).update(body, "utf8").digest("base64");
}

async function sendMenuCommand(text) {
  const rawBody = JSON.stringify({
    events: [
      {
        type: "message",
        replyToken: `test-${text}`,
        source: {
          type: "user",
          userId: "local-test-admin",
        },
        message: {
          type: "text",
          id: `test-${text}`,
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

const mainMenu = await sendMenuCommand("裔甯");
const { response, body } = mainMenu;
const replyText = body.replies?.[0]?.reply?.payload?.messages?.[0]?.text;

if (!response.ok || body.ok !== true || body.handled !== 1) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error(`LINE menu test failed with HTTP ${response.status}`);
}

if (!replyText?.includes("裔甯管理選單") || !replyText.includes("學生端連結")) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error("LINE menu reply text was not returned as expected.");
}

if (body.replies?.[0]?.pending !== null) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error("LINE menu command should not create pending redemption.");
}

const courseMenu = await sendMenuCommand("課程");
const courseMessage = courseMenu.body.replies?.[0]?.reply?.payload?.messages?.[0];
const courseLabels = (courseMessage?.quickReply?.items ?? []).map((item) => item.action?.label);
const expectedCourseLabels = ["新增預約", "完成課程", "取消課程", "返回"];

if (
  !courseMenu.response.ok ||
  !courseMessage?.text.includes("裔甯課程管理") ||
  !expectedCourseLabels.every((label) => courseLabels.includes(label))
) {
  console.error(JSON.stringify(courseMenu.body, null, 2));
  throw new Error("LINE course menu buttons were not returned as expected.");
}

console.log("LINE menu test OK");
console.log(JSON.stringify({ handled: body.handled, replyText, courseLabels }, null, 2));
