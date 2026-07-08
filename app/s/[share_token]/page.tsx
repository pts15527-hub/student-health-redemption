import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatTime } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";

export default async function StudentHomePage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const nextSession = bundle.classSessions
    .filter((session) => session.status === "scheduled")
    .sort((a, b) => `${a.session_date} ${a.session_time ?? ""}`.localeCompare(`${b.session_date} ${b.session_time ?? ""}`))[0];
  const latestRecord = bundle.redemptionRecords[0];

  return (
    <main className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">剩餘保健食品組數</p>
          <h1>{bundle.student.name}</h1>
          <strong>
            {bundle.stats.remainingCredits}
            {bundle.packagePlan?.credit_unit_label ?? "組"}
          </strong>
          <p className="muted">總共 {bundle.stats.totalCredits} 組，已扣 {bundle.stats.usedCredits} 組</p>
        </div>
        <Link className="primary-button" href={`/s/${share_token}/payments`}>
          查看繳費狀態
        </Link>
      </section>

      <section className="grid-2">
        <div className="panel">
          <p className="eyebrow">下一堂課</p>
          {nextSession ? (
            <>
              <h2>{nextSession.title}</h2>
              <p>
                {formatDate(nextSession.session_date)} {formatTime(nextSession.session_time)}
              </p>
              {nextSession.notes && <p className="muted">{nextSession.notes}</p>}
            </>
          ) : (
            <p className="muted">目前尚無預約課程</p>
          )}
        </div>

        <div className="panel">
          <p className="eyebrow">最近領取紀錄</p>
          {latestRecord ? (
            <>
              <h2>{formatDate(latestRecord.record_date)}</h2>
              <p>
                扣 {latestRecord.credit_used} 組｜剩餘 {latestRecord.remaining_after ?? bundle.stats.remainingCredits} 組
              </p>
              {latestRecord.notes && <p className="muted">{latestRecord.notes}</p>}
            </>
          ) : (
            <p className="muted">尚無領取紀錄</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>課程統計</h2>
          <Link className="button secondary" href={`/s/${share_token}/sessions`}>
            查看課程
          </Link>
        </div>
        <div className="stat-grid">
          <StatCard label="總堂數" value={bundle.stats.totalSessions} />
          <StatCard label="已上課" value={bundle.stats.completedSessions} accent />
          <StatCard label="已預約" value={bundle.stats.scheduledSessions} />
          <StatCard label="可預約" value={bundle.stats.remainingBookableSessions} />
        </div>
      </section>
    </main>
  );
}
