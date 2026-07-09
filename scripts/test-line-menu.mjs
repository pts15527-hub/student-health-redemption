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

const mainMenuLabels = (
  body.replies?.[0]?.reply?.payload?.messages?.[0]?.quickReply?.items ?? []
).map((item) => item.action?.label);
const expectedMainMenuLabels = ["課程", "繳費", "保健食品", "學生端連結"];

if (!expectedMainMenuLabels.every((label) => mainMenuLabels.includes(label))) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error("LINE main menu buttons were not returned as expected.");
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

const newBooking = await sendMenuCommand("新增預約");
const newBookingMessage = newBooking.body.replies?.[0]?.reply?.payload?.messages?.[0];
const newBookingLabels = (newBookingMessage?.quickReply?.items ?? []).map((item) => item.action?.label);

if (
  !newBooking.response.ok ||
  !newBookingMessage?.text.includes("請輸入預約日期與時間") ||
  !newBookingMessage.text.includes("７／１５　１８：３０") ||
  !newBookingLabels.includes("返回") ||
  newBooking.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(newBooking.body, null, 2));
  throw new Error("LINE new booking prompt was not returned as expected.");
}

const completeCourse = await sendMenuCommand("完成課程");
const completeCourseMessage = completeCourse.body.replies?.[0]?.reply?.payload?.messages?.[0];
const completeCourseLabels = (completeCourseMessage?.quickReply?.items ?? []).map((item) => item.action?.label);

if (
  !completeCourse.response.ok ||
  !completeCourseMessage?.text.includes("請選擇要完成的課程") ||
  !completeCourseLabels.includes("返回") ||
  completeCourse.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(completeCourse.body, null, 2));
  throw new Error("LINE complete course choices were not returned as expected.");
}

const selectableSession = completeCourseLabels.find((label) => label !== "返回");
const selectedCourse = await sendMenuCommand(`選擇完成課程 ${selectableSession}`);
const selectedCourseMessage = selectedCourse.body.replies?.[0]?.reply?.payload?.messages?.[0];
const selectedCourseLabels = (selectedCourseMessage?.quickReply?.items ?? []).map((item) => item.action?.label);

if (
  !selectedCourse.response.ok ||
  !selectedCourseMessage?.text.includes("請選擇這堂課的類型") ||
  !["訓練", "矯正", "返回"].every((label) => selectedCourseLabels.includes(label)) ||
  selectedCourse.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(selectedCourse.body, null, 2));
  throw new Error("LINE course type choices were not returned as expected.");
}

const cancelCourse = await sendMenuCommand("取消課程");
const cancelCourseMessage = cancelCourse.body.replies?.[0]?.reply?.payload?.messages?.[0];
const cancelCourseLabels = (cancelCourseMessage?.quickReply?.items ?? []).map((item) => item.action?.label);

if (
  !cancelCourse.response.ok ||
  !cancelCourseMessage?.text.includes("請選擇要取消的課程") ||
  !cancelCourseLabels.includes("返回") ||
  cancelCourse.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(cancelCourse.body, null, 2));
  throw new Error("LINE course cancellation choices were not returned as expected.");
}

const exitMenu = await sendMenuCommand("結束");
const exitMessage = exitMenu.body.replies?.[0]?.reply?.payload?.messages?.[0];

if (
  !exitMenu.response.ok ||
  !exitMessage?.text.includes("已結束") ||
  !exitMessage.text.includes("管理") ||
  exitMessage.quickReply
) {
  console.error(JSON.stringify(exitMenu.body, null, 2));
  throw new Error("LINE exit command was not returned as expected.");
}

const blockedAfterExit = await sendMenuCommand("繳費");
const blockedMessage = blockedAfterExit.body.replies?.[0]?.reply?.payload?.messages?.[0];

if (
  !blockedAfterExit.response.ok ||
  blockedAfterExit.body.ok !== false ||
  !blockedMessage?.text.includes("請先輸入學生名字")
) {
  console.error(JSON.stringify(blockedAfterExit.body, null, 2));
  throw new Error("LINE commands should be blocked after ending the active student context.");
}

const reselectedMenu = await sendMenuCommand("邱裔甯");
const reselectedMessage = reselectedMenu.body.replies?.[0]?.reply?.payload?.messages?.[0];

if (!reselectedMenu.response.ok || !reselectedMessage?.text.includes("裔甯管理選單")) {
  console.error(JSON.stringify(reselectedMenu.body, null, 2));
  throw new Error("LINE student alias should restore the active student context.");
}

const paymentMenu = await sendMenuCommand("繳費");
const paymentMessage = paymentMenu.body.replies?.[0]?.reply?.payload?.messages?.[0];
const paymentLabels = (paymentMessage?.quickReply?.items ?? []).map((item) => item.action?.label);
const installmentLabels = paymentLabels.filter((label) => label?.startsWith("第"));

if (
  !paymentMenu.response.ok ||
  !paymentMessage?.text.includes("裔甯繳費管理") ||
  installmentLabels.length !== 6 ||
  !paymentLabels.includes("返回") ||
  !paymentLabels.includes("結束") ||
  paymentMenu.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(paymentMenu.body, null, 2));
  throw new Error("LINE payment menu was not returned as expected.");
}

const firstInstallmentNo = Number(installmentLabels[0].match(/^第(\d+)期/)?.[1]);
const selectedPayment = await sendMenuCommand(`選擇繳費 第${firstInstallmentNo}期`);
const selectedPaymentMessage = selectedPayment.body.replies?.[0]?.reply?.payload?.messages?.[0];

if (
  !selectedPayment.response.ok ||
  !selectedPaymentMessage?.text.match(/登記第 \d+ 期繳費|第 \d+ 期已繳/) ||
  selectedPayment.body.replies?.[0]?.pending !== null
) {
  console.error(JSON.stringify(selectedPayment.body, null, 2));
  throw new Error("LINE selected payment response was not returned as expected.");
}

const fullWidthPaymentDate = await sendMenuCommand("第99期 ７／１０");
const fullWidthPaymentMessage = fullWidthPaymentDate.body.replies?.[0]?.reply?.payload?.messages?.[0];

if (
  fullWidthPaymentDate.response.status !== 200 ||
  !fullWidthPaymentMessage?.text.includes("找不到第 99 期繳費資料") ||
  fullWidthPaymentMessage.text.includes("第一行或第一個欄位需要是日期")
) {
  console.error(JSON.stringify(fullWidthPaymentDate.body, null, 2));
  throw new Error("LINE full-width payment date input was not routed correctly.");
}

console.log("LINE menu test OK");
console.log(
  JSON.stringify(
    {
      handled: body.handled,
      replyText,
      mainMenuLabels,
      courseLabels,
      newBookingPrompt: newBookingMessage.text,
      completeCourseLabels,
      selectedCourseLabels,
      cancelCourseLabels,
      paymentLabels,
    },
    null,
    2,
  ),
);
