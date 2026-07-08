"use client";

import { useState } from "react";
import type { PaymentRecord } from "@/types/domain";
import { formatDate, formatMoney, statusLabel } from "@/lib/format";

type Message = { type: "ok" | "error"; text: string } | null;

async function postJson(url: string, payload: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error ?? "操作失敗");
  }

  return data;
}

export function RedemptionRecordForm({ shareToken }: { shareToken: string }) {
  const [message, setMessage] = useState<Message>(null);

  async function submit(formData: FormData) {
    setMessage(null);
    try {
      await postJson(`/api/admin/${shareToken}/redemption-records`, {
        adminPasscode: formData.get("adminPasscode"),
        recordDate: formData.get("recordDate"),
        creditUsed: Number(formData.get("creditUsed")),
        notes: formData.get("notes"),
        itemsText: formData.get("itemsText"),
        bonusItemsText: formData.get("bonusItemsText"),
      });
      setMessage({ type: "ok", text: "領取紀錄已新增" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "操作失敗" });
    }
  }

  return (
    <form className="form" action={submit}>
      <label>
        管理密碼
        <input name="adminPasscode" type="password" required />
      </label>
      <label>
        領取日期
        <input name="recordDate" type="date" required />
      </label>
      <label>
        扣除組數
        <input name="creditUsed" type="number" step="0.5" min="0" required />
      </label>
      <label>
        商品明細
        <textarea name="itemsText" rows={4} placeholder="每行一筆，例如：青春源 D,2" required />
      </label>
      <label>
        贈品明細
        <textarea name="bonusItemsText" rows={3} placeholder="每行一筆，例如：珍珠粉,1" />
      </label>
      <label>
        備註
        <textarea name="notes" rows={3} />
      </label>
      <button className="primary-button" type="submit">新增領取紀錄</button>
      {message && <p className={message.type === "error" ? "danger" : "muted"}>{message.text}</p>}
    </form>
  );
}

export function ClassSessionForm({ shareToken }: { shareToken: string }) {
  const [message, setMessage] = useState<Message>(null);

  async function submit(formData: FormData) {
    setMessage(null);
    try {
      await postJson(`/api/admin/${shareToken}/class-sessions`, {
        adminPasscode: formData.get("adminPasscode"),
        sessionDate: formData.get("sessionDate"),
        sessionTime: formData.get("sessionTime"),
        title: formData.get("title"),
        status: formData.get("status"),
        content: formData.get("content"),
        notes: formData.get("notes"),
        countsTowardUsedSessions: formData.get("status") === "completed",
      });
      setMessage({ type: "ok", text: "課程紀錄已新增" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "操作失敗" });
    }
  }

  return (
    <form className="form" action={submit}>
      <label>
        管理密碼
        <input name="adminPasscode" type="password" required />
      </label>
      <label>
        日期
        <input name="sessionDate" type="date" required />
      </label>
      <label>
        時間
        <input name="sessionTime" type="time" />
      </label>
      <label>
        課程名稱
        <input name="title" required />
      </label>
      <label>
        狀態
        <select name="status" required defaultValue="completed">
          <option value="scheduled">已預約</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <label>
        課程內容
        <textarea name="content" rows={3} />
      </label>
      <label>
        備註
        <textarea name="notes" rows={3} />
      </label>
      <button className="primary-button" type="submit">新增課程紀錄</button>
      {message && <p className={message.type === "error" ? "danger" : "muted"}>{message.text}</p>}
    </form>
  );
}

export function PaymentManager({ shareToken, records }: { shareToken: string; records: PaymentRecord[] }) {
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState<Message>(null);

  async function markPaid(recordId: string) {
    setMessage(null);
    try {
      await postJson(
        `/api/admin/${shareToken}/payment-records/${recordId}`,
        {
          adminPasscode: passcode,
          status: "paid",
          paidDate: new Date().toISOString().slice(0, 10),
        },
        "PATCH",
      );
      setMessage({ type: "ok", text: "已標記繳費" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "操作失敗" });
    }
  }

  return (
    <div className="stack">
      <label className="form">
        管理密碼
        <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} />
      </label>
      <div className="grid-3">
        {records.map((record) => (
          <article className="card" key={record.id}>
            <p className="eyebrow">第 {record.installment_no} 期</p>
            <h3>{statusLabel(record.status)}</h3>
            <p>{formatMoney(record.amount)}</p>
            <p className="muted">{record.status === "paid" ? `繳費日 ${formatDate(record.paid_date)}` : `應繳日 ${formatDate(record.due_date)}`}</p>
            {record.status !== "paid" && (
              <button className="primary-button" type="button" onClick={() => markPaid(record.id)}>
                標記已繳
              </button>
            )}
          </article>
        ))}
      </div>
      {message && <p className={message.type === "error" ? "danger" : "muted"}>{message.text}</p>}
    </div>
  );
}
