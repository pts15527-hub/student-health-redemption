import Link from "next/link";

type StatCardProps = {
  label: string;
  value: string | number;
  accent?: boolean;
  href?: string;
};

export function StatCard({ label, value, accent = false, href }: StatCardProps) {
  const className = `stat-card ${accent ? "accent" : ""} ${href ? "interactive" : ""}`.trim();
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );

  return href ? (
    <Link className={className} href={href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
