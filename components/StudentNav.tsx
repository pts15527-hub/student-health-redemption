"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["", "首頁"],
  ["/catalog", "型錄"],
  ["/sessions", "課程"],
  ["/records", "紀錄"],
  ["/plan", "方案"],
] as const;

export function StudentNav({ shareToken }: { shareToken: string }) {
  const pathname = usePathname();
  const basePath = `/s/${shareToken}`;

  return (
    <nav className="bottom-nav" aria-label="學生端導覽">
      {items.map(([path, label]) => {
        const href = `${basePath}${path}`;
        const isActive = path === "" ? pathname === basePath : pathname.startsWith(href);

        return (
          <Link key={label} href={href} className={isActive ? "active" : undefined} aria-current={isActive ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
