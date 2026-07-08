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
const rawBody = JSON.stringify({
  shareToken: "yi-ning",
  messageText: "7/1\nB群 1組\nD 1組\n白賦美 1組",
});

function sign(body) {
  return crypto.createHmac("sha256", channelSecret).update(body, "utf8").digest("base64");
}

const signedResponse = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-line-signature": sign(rawBody),
  },
  body: rawBody,
});

const signedBody = await signedResponse.json();

if (!signedResponse.ok || signedBody.ok !== true) {
  console.error(JSON.stringify(signedBody, null, 2));
  throw new Error(`Signed webhook request failed with HTTP ${signedResponse.status}`);
}

const badResponse = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-line-signature": "invalid-signature",
  },
  body: rawBody,
});

const badBody = await badResponse.json();

if (badResponse.status !== 401 || badBody.ok !== false) {
  console.error(JSON.stringify(badBody, null, 2));
  throw new Error(`Expected invalid signature to be rejected with HTTP 401, got ${badResponse.status}`);
}

console.log("LINE signature test OK");
console.log(JSON.stringify({ signed: signedBody.ok, rejectedInvalidSignature: badBody.errors }, null, 2));
