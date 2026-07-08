export type ParsedBookingInput = {
  sessionDate: string;
  sessionTime: string;
  displayDate: string;
  displayTime: string;
};

export function parseBookingInput(input: string, year = getTaipeiYear()):
  | { ok: true; data: ParsedBookingInput }
  | { ok: false; error: string } {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);

  if (!match) {
    return {
      ok: false,
      error: "格式不正確，請輸入例如：7/15 18:30",
    };
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, error: "日期不存在，請重新輸入。" };
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { ok: false, error: "時間不存在，請使用 24 小時制，例如：18:30" };
  }

  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  const paddedHour = String(hour).padStart(2, "0");
  const paddedMinute = String(minute).padStart(2, "0");

  return {
    ok: true,
    data: {
      sessionDate: `${year}-${paddedMonth}-${paddedDay}`,
      sessionTime: `${paddedHour}:${paddedMinute}:00`,
      displayDate: `${month}/${day}`,
      displayTime: `${paddedHour}:${paddedMinute}`,
    },
  };
}

function getTaipeiYear() {
  return Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(new Date()),
  );
}
