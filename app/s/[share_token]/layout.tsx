import type { Metadata } from "next";
import { StudentNav } from "@/components/StudentNav";
import { getStudentByShareToken } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ share_token: string }>;
}): Promise<Metadata> {
  const { share_token } = await params;
  const student = await getStudentByShareToken(share_token);

  return {
    title: student ? `${student.name}｜專案紀錄` : "學生專案紀錄",
  };
}

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ share_token: string }>;
}) {
  const { share_token } = await params;

  return (
    <div className="shell">
      {children}
      <StudentNav shareToken={share_token} />
    </div>
  );
}
