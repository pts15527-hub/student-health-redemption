export function formatDate(date: string | null | undefined) {
  if (!date) return "未設定";
  return date.replaceAll("-", "/");
}

export function formatTime(time: string | null | undefined) {
  if (!time) return "";
  return time.slice(0, 5);
}

export function formatMoney(amount: number | null | undefined) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "已繳",
    unpaid: "未繳",
    late: "逾期",
    waived: "免繳",
    scheduled: "已預約",
    completed: "已完成",
    cancelled: "已取消",
  };

  return labels[status] ?? status;
}
