import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPasscode } from "@/lib/api-auth";
import { getStudentByShareToken } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  adminPasscode: z.string(),
  sessionDate: z.string(),
  sessionTime: z.string().optional().nullable(),
  title: z.string().min(1),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  content: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  countsTowardUsedSessions: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const body = schema.parse(await request.json());
  const authError = verifyAdminPasscode(body.adminPasscode);

  if (authError) return authError;

  const student = await getStudentByShareToken(share_token);

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("class_sessions")
    .insert({
      student_id: student.id,
      session_date: body.sessionDate,
      session_time: body.sessionTime || null,
      title: body.title,
      status: body.status,
      content: body.content || null,
      notes: body.notes || null,
      counts_toward_used_sessions: body.countsTowardUsedSessions,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, classSessionId: data.id });
}
