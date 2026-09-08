export type CsvCell = string | number | null | undefined;

/** 셀 하나를 CSV 규격으로 만든다. 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 안의 따옴표는 두 번 쓴다. */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // 엑셀 수식 주입 방지. -나 +는 "- 재부팅" 같은 정상 목록이 흔해 건드리지 않는다.
  if (text.startsWith("=") || text.startsWith("@")) {
    text = `'${text}`;
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** 헤더 한 줄 + 행들. 줄 구분은 CRLF — 엑셀이 가장 무난하게 읽는다. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell), ...rows.map((row) => row.map(escapeCell))];
  return lines.map((line) => line.join(",")).join("\r\n");
}

/** 오늘 날짜 YYYYMMDD. 파일명에 붙인다. */
export function todayStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/** CSV를 파일로 내려준다. 앞에 UTF-8 BOM을 붙여야 엑셀에서 한글이 안 깨진다. */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const csv = toCsv(headers, rows);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
