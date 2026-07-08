import Link from "next/link";

const items = [
  ["", "首頁"],
  ["/catalog", "型錄"],
  ["/sessions", "課程"],
  ["/records", "紀錄"],
  ["/plan", "方案"],
] as const;

export function StudentNav({ shareToken }: { shareToken: string }) {
  return (
    <nav className="bottom-nav" aria-label="學生端導覽">
      {items.map(([path, label]) => (
        <Link key={label} href={`/s/${shareToken}${path}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
