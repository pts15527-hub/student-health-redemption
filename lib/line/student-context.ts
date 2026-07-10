import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Student } from "@/types/domain";

export type LineStudentContext = {
  student: Student;
  aliasDisplay: string;
};

export type LineAdminContext = {
  student: Student;
  pendingAction: string | null;
  pendingPayload: Record<string, unknown> | null;
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
  const context = await getLineAdminContext(adminUserId);
  return context?.student ?? null;
}

export async function getLineAdminContext(adminUserId: string): Promise<LineAdminContext | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("line_admin_contexts")
    .select("pending_action, pending_payload, students(*)")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();

  if (error) {
    if (isMissingPendingContextColumn(error.message)) return getLineAdminContextWithoutPending(adminUserId);
    return null;
  }

  if (!data?.students) return null;

  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  if (!student) return null;

  return {
    student: student as Student,
    pendingAction: data.pending_action ?? null,
    pendingPayload: (data.pending_payload as Record<string, unknown> | null) ?? null,
  };
}

export async function setActiveLineStudent(adminUserId: string, studentId: string) {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_admin_contexts").upsert(
    {
      admin_user_id: adminUserId,
      active_student_id: studentId,
      pending_action: null,
      pending_payload: null,
      selected_at: now,
      updated_at: now,
    },
    { onConflict: "admin_user_id" },
  );

  if (error && isMissingPendingContextColumn(error.message)) {
    const { error: fallbackError } = await supabase.from("line_admin_contexts").upsert(
      {
        admin_user_id: adminUserId,
        active_student_id: studentId,
        selected_at: now,
        updated_at: now,
      },
      { onConflict: "admin_user_id" },
    );

    return fallbackError;
  }

  return error;
}

export async function setPendingPaymentDateInput(adminUserId: string, studentId: string, installmentNo: number) {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_admin_contexts").upsert(
    {
      admin_user_id: adminUserId,
      active_student_id: studentId,
      pending_action: "payment_date_input",
      pending_payload: { installmentNo },
      updated_at: now,
    },
    { onConflict: "admin_user_id" },
  );

  if (error && isMissingPendingContextColumn(error.message)) return null;
  return error;
}

export async function clearPendingLineAction(adminUserId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("line_admin_contexts")
    .update({
      pending_action: null,
      pending_payload: null,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_user_id", adminUserId);

  if (error && isMissingPendingContextColumn(error.message)) return null;
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

async function getLineAdminContextWithoutPending(adminUserId: string): Promise<LineAdminContext | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("line_admin_contexts")
    .select("students(*)")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();

  if (error || !data?.students) return null;

  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  if (!student) return null;

  return {
    student: student as Student,
    pendingAction: null,
    pendingPayload: null,
  };
}

function isMissingPendingContextColumn(message: string) {
  return (
    message.includes("pending_action") ||
    message.includes("pending_payload") ||
    message.includes("Could not find") ||
    message.includes("schema cache")
  );
}
