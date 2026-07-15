export function visibleSessionNote(note: string | null) {
  if (!note || note.trim() === "由 LINE Bot 新增") return null;
  return note;
}
