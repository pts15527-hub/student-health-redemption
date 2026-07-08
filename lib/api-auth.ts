import { NextResponse } from "next/server";

export function verifyAdminPasscode(passcode: unknown) {
  const expected = process.env.ADMIN_PASSCODE;

  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSCODE is not configured." }, { status: 500 });
  }

  if (typeof passcode !== "string" || passcode !== expected) {
    return NextResponse.json({ error: "Invalid admin passcode." }, { status: 401 });
  }

  return null;
}
