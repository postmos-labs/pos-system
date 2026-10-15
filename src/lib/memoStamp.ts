// 히스토리(메모) 한 줄을 기존 내용 뒤에 붙인다. 히스토리 화면은 `[이름 YYYY. MM. DD. HH:mm]` 스탬프를
// 기준으로 항목을 나누므로, 스탬프 없이 붙이면 새 글이 바로 앞 항목의 내용으로 읽혀 뒤에 달린다.
export function appendStampedMemo(
  prevMemo: string | null | undefined,
  user: string,
  text: string,
): string {
  const time = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const entry = `[${user || "사용자"} ${time}] ${text}`;
  const prev = (prevMemo ?? "").trim();
  return prev ? `${prev}\n${entry}` : entry;
}
