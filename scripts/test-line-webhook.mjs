const endpoint = process.env.LINE_WEBHOOK_TEST_URL ?? "http://127.0.0.1:3000/api/line/webhook";

const payload = {
  shareToken: "yi-ning",
  messageText: "7/1\nB群 1組\nD 1組\n白賦美 1組",
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await response.json();

if (!response.ok || body.ok !== true) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error(`Webhook test failed with HTTP ${response.status}`);
}

if (body.parsed?.creditUsed !== 3 || body.parsed?.totalBoxes !== 11) {
  console.error(JSON.stringify(body, null, 2));
  throw new Error("Webhook parsed summary did not match expected creditUsed=3 and totalBoxes=11");
}

console.log("LINE webhook skeleton OK");
console.log(JSON.stringify(body, null, 2));
