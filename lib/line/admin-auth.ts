import { NextResponse } from "next/server";

const LOCAL_TEST_ADMIN_USER_ID = "local-test-admin";

export function verifyLineAdminUserId(adminUserId: unknown) {
  if (typeof adminUserId !== "string" || adminUserId.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errors: ["adminUserId 必須是非空白字串；正式 LINE 串接時會改用 event.source.userId"],
      },
      { status: 401 },
    );
  }

  const allowedUserIds = parseAllowedUserIds();

  if (allowedUserIds.includes(adminUserId)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production" && adminUserId === LOCAL_TEST_ADMIN_USER_ID) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      errors: ["此 LINE 使用者不在管理者 allowlist 中"],
    },
    { status: 403 },
  );
}

function parseAllowedUserIds() {
  return (process.env.LINE_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((userId) => userId.trim())
    .filter(Boolean);
}
