import { StatCard } from "@/components/StatCard";
import { formatDate, formatTime, statusLabel } from "@/lib/format";
import { getStudentBundle } from "@/lib/data";

export default async function SessionsPage({ params }: { params: Promise<{ share_token: string }> }) {
  const { share_token } = await params;
  const bundle = await getStudentBundle(share_token);
  const scheduled = bundle.classSessions
    .filter((session) => session.status === "scheduled")
    .sort((a, b) => `${a.session_date} ${a.session_time ?? ""}`.localeCompare(`${b.session_date} ${b.session_time ?? ""}`));
  const completed = bundle.classSessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => `${b.session_date} ${b.session_time ?? ""}`.localeCompare(`${a.session_date} ${a.session_time ?? ""}`));
  const cancelled = bundle.classSessions
    .filter((session) => session.status === "cancelled")
    .sort((a, b) => `${b.session_date} ${b.session_time ?? ""}`.localeCompare(`${a.session_date} ${a.session_time ?? ""}`));

  return (
    <main className="stack">
      <header className="topbar">
        <div>
          <p className="eyebrow">課程合約與上課紀錄</p>
          <h1>{bundle.courseContract?.plan_name ?? bundle.student.project_name}</h1>
        </div>
      </header>

      {bundle.courseContract ? (
        <>
          <section className="panel">
            <div className="stat-grid">
              <StatCard label="總堂數" value={bundle.stats.totalSessions} />
              <StatCard label="已上課" value={bundle.stats.completedSessions} accent />
              <StatCard label="已預約" value={bundle.stats.scheduledSessions} />
              <StatCard label="剩餘堂數" value={bundle.stats.remainingSessions} />
              <StatCard label="可預約" value={bundle.stats.remainingBookableSessions} />
            </div>
          </section>

          <section className="panel">
            <h2>合約摘要</h2>
            <div className="grid">
              <div className="detail-row">
                <span>專案名稱</span>
                <strong>{bundle.student.project_name}</strong>
              </div>
              <div className="detail-row">
                <span>課程方案</span>
                <strong>{bundle.courseContract.plan_name}</strong>
              </div>
              <div className="detail-row">
                <span>正式起算日</span>
                <strong>{formatDate(bundle.courseContract.start_date)}</strong>
              </div>
              <div className="detail-row">
                <span>專案期間</span>
                <strong>
                  {bundle.courseContract.duration_months} 個月，含 {bundle.courseContract.buffer_months} 個月緩衝期
                </strong>
              </div>
              {bundle.courseContract.location && (
                <div className="detail-row">
                  <span>上課地點</span>
                  <strong>{bundle.courseContract.location}</strong>
                </div>
              )}
            </div>
            {bundle.courseContract.service_items.length ? (
              <p className="muted">服務內容：{bundle.courseContract.service_items.join("、")}</p>
            ) : null}
            {bundle.courseContract.notes && <p className="muted">{bundle.courseContract.notes}</p>}
            {bundle.student.risk_notes.map((note) => (
              <p className="muted" key={note}>
                {note}
              </p>
            ))}
          </section>
        </>
      ) : (
        <section className="panel empty-state">
          <h2>尚無課程合約</h2>
          <p className="muted">課程權益資料設定後會顯示在這裡。</p>
        </section>
      )}

      <section className="panel anchor-section" id="scheduled">
        <div className="section-heading">
          <h2>即將上課</h2>
          <span className="badge">{scheduled.length} 堂</span>
        </div>
        <div className="session-list">
          {scheduled.map((session) => (
            <article className="session-item upcoming" key={session.id}>
              <div className="session-date">
                <strong>{formatDate(session.session_date)}</strong>
                <span>{formatTime(session.session_time)}</span>
              </div>
              <div>
                <span className="badge">{statusLabel(session.status)}</span>
                <h3>{session.title}</h3>
                {bundle.courseContract?.location && <p className="muted">{bundle.courseContract.location}</p>}
                {session.notes && <p>{session.notes}</p>}
              </div>
            </article>
          ))}
          {!scheduled.length && <p className="muted">目前沒有預約課程</p>}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>上課紀錄</h2>
          <span className="badge">{completed.length} 堂</span>
        </div>
        <div className="session-list">
          {completed.map((session) => (
            <article className="session-item" key={session.id}>
              <div className="session-date">
                <strong>{formatDate(session.session_date)}</strong>
                <span>{formatTime(session.session_time)}</span>
              </div>
              <div>
                <span className="badge">{statusLabel(session.status)}</span>
                <h3>{session.title}</h3>
                {session.content && <p>{session.content}</p>}
                {session.notes && <p className="muted">{session.notes}</p>}
              </div>
            </article>
          ))}
          {!completed.length && <p className="muted">目前沒有完成紀錄</p>}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>取消紀錄</h2>
          <span className="badge">{cancelled.length} 筆</span>
        </div>
        <div className="session-list">
          {cancelled.map((session) => (
            <article className="session-item cancelled" key={session.id}>
              <div className="session-date">
                <strong>{formatDate(session.session_date)}</strong>
                <span>{formatTime(session.session_time)}</span>
              </div>
              <div>
                <span className="badge">{statusLabel(session.status)}</span>
                <h3>{session.title}</h3>
                {session.notes && <p className="muted">{session.notes}</p>}
              </div>
            </article>
          ))}
          {!cancelled.length && <p className="muted">目前沒有取消紀錄</p>}
        </div>
      </section>
    </main>
  );
}
