import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatTime } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";
import { visibleSessionNote } from "@/lib/session-display";

export default async function StudentHomePage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const creditUnit = bundle.packagePlan?.credit_unit_label ?? "組";
  const nextSession = bundle.classSessions
    .filter((session) => session.status === "scheduled")
    .sort((a, b) => `${a.session_date} ${a.session_time ?? ""}`.localeCompare(`${b.session_date} ${b.session_time ?? ""}`))[0];
  const latestRecord = bundle.redemptionRecords[0];

  return (
    <main className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">{bundle.student.name}｜剩餘保健食品組數</p>
          <h1>
            {bundle.stats.remainingCredits}
            {creditUnit}
          </h1>
          <strong>
            已扣 {bundle.stats.usedCredits} / 共 {bundle.stats.totalCredits} {creditUnit}
          </strong>
          {bundle.packagePlan ? (
            <p className="muted">
              {bundle.packagePlan.plan_name}
            </p>
          ) : (
            <p className="muted">目前尚無保健食品方案</p>
          )}
        </div>
        <div className="hero-actions">
          <Link className="primary-button" href={`/s/${share_token}/payments`}>
            查看繳費狀態
          </Link>
          <Link className="button secondary" href={`/s/${share_token}/records`}>
            查看領取紀錄
          </Link>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="section-heading compact">
            <p className="eyebrow">下一堂課</p>
            <Link className="text-link" href={`/s/${share_token}/sessions#scheduled`}>
              查看預約
            </Link>
          </div>
          {nextSession ? (
            <>
              <h2>{nextSession.title}</h2>
              <p>
                {formatDate(nextSession.session_date)} {formatTime(nextSession.session_time)}
              </p>
              {visibleSessionNote(nextSession.notes) && <p className="muted">{visibleSessionNote(nextSession.notes)}</p>}
            </>
          ) : (
            <p className="muted">目前尚無預約課程</p>
          )}
        </div>

        <div className="panel">
          <div className="section-heading compact">
            <p className="eyebrow">最近領取紀錄</p>
            <Link className="text-link" href={`/s/${share_token}/records`}>
              全部紀錄
            </Link>
          </div>
          {latestRecord ? (
            <>
              <h2>{formatDate(latestRecord.record_date)}</h2>
              <p>
                扣 {latestRecord.credit_used} {creditUnit}｜剩餘 {latestRecord.remaining_after ?? bundle.stats.remainingCredits}{" "}
                {creditUnit}
              </p>
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
        {bundle.courseContract ? (
          <div className="stat-grid">
            <StatCard label="總堂數" value={bundle.stats.totalSessions} />
            <StatCard label="已上課" value={bundle.stats.completedSessions} accent />
            <StatCard
              label="已預約"
              value={bundle.stats.scheduledSessions}
              href={`/s/${share_token}/sessions#scheduled`}
            />
            <StatCard label="可預約" value={bundle.stats.remainingBookableSessions} />
          </div>
        ) : (
          <p className="muted empty-state">目前尚無課程合約</p>
        )}
      </section>
    </main>
  );
}
