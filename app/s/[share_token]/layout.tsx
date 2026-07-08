import { StudentNav } from "@/components/StudentNav";

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
