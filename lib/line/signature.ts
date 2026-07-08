import crypto from "node:crypto";
import { NextResponse } from "next/server";

const LOCAL_TEST_CHANNEL_SECRET = "local-test-channel-secret";

export function buildLineSignature(rawBody: string, channelSecret = getLineChannelSecret()) {
  return crypto.createHmac("sha256", channelSecret).update(rawBody, "utf8").digest("base64");
}

export function verifyLineSignature(rawBody: string, signature: string, channelSecret = getLineChannelSecret()) {
  const expected = buildLineSignature(rawBody, channelSecret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyLineSignatureGuard(rawBody: string, headers: Headers) {
  const signature = headers.get("x-line-signature");
  const shouldRequireSignature = process.env.NODE_ENV === "production" || process.env.LINE_SIGNATURE_REQUIRED === "true";

  if (!signature) {
    if (shouldRequireSignature) {
      return NextResponse.json(
        {
          ok: false,
          errors: ["缺少 x-line-signature，拒絕處理 LINE webhook"],
        },
        { status: 401 },
      );
    }

    return null;
  }

  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json(
      {
        ok: false,
        errors: ["LINE signature 驗證失敗"],
      },
      { status: 401 },
    );
  }

  return null;
}

function getLineChannelSecret() {
  if (process.env.LINE_CHANNEL_SECRET) {
    return process.env.LINE_CHANNEL_SECRET;
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_TEST_CHANNEL_SECRET;
  }

  throw new Error("Missing LINE_CHANNEL_SECRET.");
}
