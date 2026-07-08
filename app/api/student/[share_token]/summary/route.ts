import { NextResponse } from "next/server";
import { getStudentBundle } from "@/lib/data";

export async function GET(_request: Request, { params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);

  return NextResponse.json(bundle);
}
