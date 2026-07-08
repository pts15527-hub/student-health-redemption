const endpoint = process.env.LINE_WEBHOOK_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook";

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify({
    shareToken: "yi-ning",
    messageText: "7/1\nB群 1組\nD 1組\n白賦美 1組",
    persistPending: true,
    isTest: true,
    adminUserId: "not-allowed-user",
  }),
});

const body = await response.json();

if (response.status !== 403 || body.ok !== false) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error(`Expected unauthorized admin to be rejected with HTTP 403, got ${response.status}`);
}

console.log("LINE admin auth test OK");
console.log(JSON.stringify(body, null, 2));
