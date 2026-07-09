import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Student } from "@/types/domain";

export type LineStudentContext = {
  student: Student;
  aliasDisplay: string;
};

export async function findStudentByAlias(input: string): Promise<LineStudentContext | null> {
  const aliasKey = normalizeStudentAlias(input);
  if (!aliasKey) return null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_aliases")
    .select("alias_display, students(*)")
    .eq("alias_key", aliasKey)
    .maybeSingle();

  if (error || !data?.students) return null;

  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  if (!student) return null;

  return {
    student: student as Student,
    aliasDisplay: data.alias_display,
  };
}

export async function getActiveLineStudent(adminUserId: string): Promise<Student | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("line_admin_contexts")
    .select("students(*)")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();

  if (error || !data?.students) return null;

  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  return student ? (student as Student) : null;
}

export async function setActiveLineStudent(adminUserId: string, studentId: string) {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_admin_contexts").upsert(
    {
      admin_user_id: adminUserId,
      active_student_id: studentId,
      selected_at: now,
      updated_at: now,
    },
    { onConflict: "admin_user_id" },
  );

  return error;
}

export async function clearActiveLineStudent(adminUserId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("line_admin_contexts").delete().eq("admin_user_id", adminUserId);
  return error;
}

function normalizeStudentAlias(input: string) {
  return input.normalize("NFKC").replace(/\s+/g, "").trim();
}
